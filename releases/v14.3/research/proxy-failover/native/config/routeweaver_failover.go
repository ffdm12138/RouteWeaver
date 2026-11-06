package config

import (
	"fmt"
	"slices"
	"strings"

	"github.com/metacubex/mihomo/adapter/outboundgroup"
	"github.com/metacubex/mihomo/common/structure"
	C "github.com/metacubex/mihomo/constant"
	T "github.com/metacubex/mihomo/tunnel"
)

// RawRouteWeaverFailover describes an optional selector synthesized by the core.
type RawRouteWeaverFailover struct {
	Name     string   `yaml:"name" json:"name"`
	Source   string   `yaml:"source" json:"source"`
	Policies []string `yaml:"policies" json:"policies"`
}

func (f *RawRouteWeaverFailover) addGroup(groups []map[string]any, proxies map[string]C.Proxy) ([]map[string]any, error) {
	if f == nil {
		return groups, nil
	}
	if f.Name == "" || f.Name == "GLOBAL" || strings.ContainsAny(f.Name, ",#&\r\n") || proxies[f.Name] != nil || len(f.Policies) == 0 {
		return nil, fmt.Errorf("routeweaver-failover: invalid selector name or empty policies")
	}
	var source map[string]any
	selectors := make(map[string]bool, len(groups))
	for _, group := range groups {
		name, _ := group["name"].(string)
		if name == f.Name {
			return nil, fmt.Errorf("routeweaver-failover: duplicate selector %q", f.Name)
		}
		if group["type"] == "select" {
			selectors[name] = true
			if name == f.Source {
				source = group
			}
		}
	}
	if source == nil {
		return nil, fmt.Errorf("routeweaver-failover: source %q must be a selector", f.Source)
	}
	seen := make(map[string]bool, len(f.Policies))
	for _, name := range f.Policies {
		if !selectors[name] || seen[name] {
			return nil, fmt.Errorf("routeweaver-failover: invalid or duplicate policy %q", name)
		}
		seen[name] = true
	}
	var options outboundgroup.GroupCommonOption
	decoder := structure.NewDecoder(structure.Option{TagName: "group", WeaklyTypedInput: true})
	if err := decoder.Decode(source, &options); err != nil {
		return nil, fmt.Errorf("routeweaver-failover: source options: %w", err)
	}
	names := []string{"REJECT"}
	for _, name := range options.Proxies {
		if name == "REJECT" {
			continue
		}
		if !C.IsRouteWeaverTransport(proxies[name]) {
			return nil, fmt.Errorf("routeweaver-failover: source member %q is not a transport", name)
		}
		names = append(names, name)
	}
	backup := map[string]any{
		"name": f.Name, "type": "select", "proxies": names, "use": options.Use,
		"exclude-filter": options.ExcludeFilter, "default-selected": "REJECT", "empty-fallback": "REJECT",
	}
	return append(slices.Clone(groups), backup), nil
}

func (f *RawRouteWeaverFailover) bind(proxies map[string]C.Proxy) *T.RouteWeaverFailover {
	if f == nil {
		return nil
	}
	backup := proxies[f.Name]
	policies := make(map[string]C.Proxy, len(f.Policies))
	for _, name := range f.Policies {
		policies[name] = proxies[name]
	}
	return T.NewRouteWeaverFailover(backup, proxies["REJECT"], policies)
}
