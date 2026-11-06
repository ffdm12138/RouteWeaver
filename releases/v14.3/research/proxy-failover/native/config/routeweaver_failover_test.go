package config_test

import (
	"slices"
	"testing"

	"github.com/metacubex/mihomo/adapter/outboundgroup"
	"github.com/metacubex/mihomo/config"
	_ "github.com/metacubex/mihomo/hub/executor" // Supplies the parser's temporary general settings hook.
)

func TestRouteWeaverFailoverDescriptor(t *testing.T) {
	const raw = `
proxies:
  - {name: Node, type: socks5, server: 127.0.0.1, port: 1080}
proxy-groups:
  - {name: Primary, type: select, proxies: [REJECT, Node], exclude-filter: '^REJECT$'}
routeweaver-failover: {name: Standby, source: Primary, policies: [Primary]}
`
	cfg, err := config.Parse([]byte(raw))
	if err != nil {
		t.Fatal(err)
	}
	selector := cfg.Proxies["Standby"].Adapter().(*outboundgroup.Selector)
	var names []string
	for _, node := range selector.Proxies() {
		names = append(names, node.Name())
	}
	if !slices.Equal(names, []string{"REJECT", "Node"}) || selector.Now() != "REJECT" {
		t.Fatalf("members %v, selected %s", names, selector.Now())
	}
	if err := selector.Set("Node"); err != nil || selector.Now() != "Node" {
		t.Fatalf("manual selection: %v (%s)", err, selector.Now())
	}
	selector.ForceSet("removed")
	if selector.Now() != "REJECT" {
		t.Fatalf("missing saved member must disable failover: %s", selector.Now())
	}
}

func TestRouteWeaverFailoverInvalidPolicy(t *testing.T) {
	const raw = `
proxy-groups:
  - {name: Primary, type: select, proxies: [REJECT]}
routeweaver-failover: {name: Standby, source: Primary, policies: [Missing]}
`
	if _, err := config.Parse([]byte(raw)); err == nil {
		t.Fatal("missing policy was accepted")
	}
}
