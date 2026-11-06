package tunnel

import (
	"context"
	"slices"
	"sync"
	"sync/atomic"
	"time"

	C "github.com/metacubex/mihomo/constant"
	"github.com/metacubex/mihomo/log"
)

const (
	routeWeaverProbeInterval = 5 * time.Second
	routeWeaverProbeTimeout  = 3 * time.Second
)

var activeRouteWeaverFailover atomic.Pointer[RouteWeaverFailover]

type routeWeaverSelector interface {
	Selection(touch bool) (C.Proxy, any)
	SetRouteWeaverBackup(C.Proxy, func())
	UDPDisabled() bool
}

type RouteWeaverFailover struct {
	backup   C.Proxy
	selector routeWeaverSelector
	policies map[string]C.Proxy
	wake     chan struct{}
	cancel   context.CancelFunc

	mu      sync.RWMutex
	choice  any
	current C.Proxy
	nodes   map[C.Proxy]*routeWeaverHealth
}

type routeWeaverHealth struct {
	cancel     context.CancelFunc
	successes  uint8
	failures   uint8
	readyUntil time.Time
	down       bool
}

func (h *routeWeaverHealth) observe(ok bool) {
	if ok {
		h.readyUntil = time.Now().Add(2 * routeWeaverProbeInterval)
		h.failures = 0
		if h.successes < 2 {
			h.successes++
		}
		if h.successes == 2 {
			h.down = false
		}
	} else {
		h.readyUntil = time.Time{}
		h.successes = 0
		if h.failures < 2 {
			h.failures++
		}
		if h.failures == 2 {
			h.down = true
		}
	}
}

func NewRouteWeaverFailover(backup, reject C.Proxy, policies map[string]C.Proxy) *RouteWeaverFailover {
	f := &RouteWeaverFailover{
		backup: backup, selector: backup.Adapter().(routeWeaverSelector), policies: policies,
		wake: make(chan struct{}, 1), nodes: make(map[C.Proxy]*routeWeaverHealth),
	}
	f.selector.SetRouteWeaverBackup(reject, f.schedule)
	return f
}

// SetRouteWeaverFailover owns probes for the applied configuration only.
// The executor serializes configuration changes.
func SetRouteWeaverFailover(next *RouteWeaverFailover) {
	if prior := activeRouteWeaverFailover.Swap(nil); prior != nil {
		prior.cancel()
	}
	if next != nil {
		ctx, cancel := context.WithCancel(context.Background())
		next.cancel = cancel
		activeRouteWeaverFailover.Store(next)
		go next.run(ctx)
	}
}

func (f *RouteWeaverFailover) schedule() {
	select {
	case f.wake <- struct{}{}:
	default:
	}
}

func (f *RouteWeaverFailover) run(ctx context.Context) {
	ticker := time.NewTicker(routeWeaverProbeInterval)
	defer ticker.Stop()
	for ctx.Err() == nil {
		f.reconcile(ctx)
		select {
		case <-ctx.Done():
			return
		case <-f.wake:
		case <-ticker.C:
		}
	}
}

func (f *RouteWeaverFailover) reconcile(ctx context.Context) {
	backup, choice := f.selector.Selection(false)
	wanted := make(map[C.Proxy]struct{})
	if C.IsRouteWeaverTransport(backup) {
		wanted[backup] = struct{}{}
		for _, policy := range f.policies {
			primary, _, _ := routeWeaverSelected(policy, false)
			if C.IsRouteWeaverTransport(primary) {
				wanted[primary] = struct{}{}
			}
		}
	}

	f.mu.Lock()
	defer f.mu.Unlock()
	if f.choice != choice || f.current != backup {
		for _, health := range f.nodes {
			health.cancel()
		}
		f.nodes = make(map[C.Proxy]*routeWeaverHealth)
		f.choice, f.current = choice, backup
	}
	for node, health := range f.nodes {
		if _, ok := wanted[node]; !ok {
			health.cancel()
			delete(f.nodes, node)
		}
	}
	for node := range wanted {
		if f.nodes[node] == nil {
			probeCtx, cancel := context.WithCancel(ctx)
			health := &routeWeaverHealth{cancel: cancel}
			f.nodes[node] = health
			go f.probe(probeCtx, node, health, backup, choice)
		}
	}
}

func (f *RouteWeaverFailover) probe(ctx context.Context, node C.Proxy, health *routeWeaverHealth, backup C.Proxy, choice any) {
	prober, ok := node.(interface {
		RouteWeaverProbe(context.Context, string) bool
	})
	if !ok {
		return
	}
	ticker := time.NewTicker(routeWeaverProbeInterval)
	defer ticker.Stop()
	for ctx.Err() == nil {
		selected, token := f.selector.Selection(false)
		if selected != backup || token != choice {
			f.schedule()
			return
		}
		check, cancel := context.WithTimeout(ctx, routeWeaverProbeTimeout)
		healthy := prober.RouteWeaverProbe(check, C.DefaultTestURL)
		cancel()

		f.mu.Lock()
		if ctx.Err() == nil {
			health.observe(healthy)
		}
		f.mu.Unlock()
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

// Resolve once per new flow, before the UDP and DNS L3 capability checks. The
// selection saved by the app is separate from this connection's actual route.
func routeWeaverEffective(policy C.Proxy) C.Proxy {
	f := activeRouteWeaverFailover.Load()
	if f == nil || policy == nil || f.policies[policy.Name()] != policy {
		return policy
	}
	backup, choice := f.selector.Selection(false)
	if !C.IsRouteWeaverTransport(backup) {
		return policy
	}
	primary, chain, udp := routeWeaverSelected(policy, true)
	if !C.IsRouteWeaverTransport(primary) {
		return policy
	}
	f.mu.RLock()
	main, spare := f.nodes[primary], f.nodes[backup]
	current := f.choice == choice && f.current == backup
	takeover := current && main != nil && main.down && spare != nil && time.Now().Before(spare.readyUntil) && primary != backup
	f.mu.RUnlock()
	if !current || main == nil {
		f.schedule()
	}
	if takeover {
		log.Debugln("[RouteWeaver] %s uses %s via %s (primary %s)", policy.Name(), backup.Name(), f.backup.Name(), primary.Name())
		primary, chain = backup, []C.ProxyAdapter{policy, f.backup}
	}
	return &routeWeaverRoute{Proxy: primary, chain: chain, udp: udp}
}

func routeWeaverNamed(adapter C.ProxyAdapter) C.ProxyAdapter {
	if proxy, ok := adapter.(C.Proxy); ok {
		return routeWeaverEffective(proxy)
	}
	return adapter
}

func routeWeaverSelected(policy C.Proxy, touch bool) (C.Proxy, []C.ProxyAdapter, bool) {
	var chain []C.ProxyAdapter
	udp := true
	for current := policy; ; {
		selector, ok := current.Adapter().(routeWeaverSelector)
		if !ok {
			return current, chain, udp
		}
		if slices.Contains(chain, C.ProxyAdapter(current)) {
			return nil, nil, false
		}
		chain = append(chain, current)
		udp = udp && !selector.UDPDisabled()
		current, _ = selector.Selection(touch)
	}
}

type routeWeaverRoute struct {
	C.Proxy
	chain []C.ProxyAdapter
	udp   bool
}

func (r *routeWeaverRoute) Name() string { return r.chain[0].Name() }

func (r *routeWeaverRoute) SupportUDP() bool { return r.udp && r.Proxy.SupportUDP() }

func (r *routeWeaverRoute) DialContext(ctx context.Context, metadata *C.Metadata) (C.Conn, error) {
	conn, err := r.Proxy.DialContext(ctx, metadata)
	if err == nil {
		for i := len(r.chain) - 1; i >= 0; i-- {
			conn.AppendToChains(r.chain[i])
		}
	}
	return conn, err
}

func (r *routeWeaverRoute) ListenPacketContext(ctx context.Context, metadata *C.Metadata) (C.PacketConn, error) {
	if !r.SupportUDP() {
		return nil, C.ErrNotSupport
	}
	conn, err := r.Proxy.ListenPacketContext(ctx, metadata)
	if err == nil {
		for i := len(r.chain) - 1; i >= 0; i-- {
			conn.AppendToChains(r.chain[i])
		}
	}
	return conn, err
}
