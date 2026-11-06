package tunnel

import (
	"testing"
	"time"
)

func TestRouteWeaverFailoverHysteresis(t *testing.T) {
	var node routeWeaverHealth
	for _, step := range []struct {
		probe bool
		down  bool
	}{
		{true, false}, {false, false}, {true, false},
		{false, false}, {false, true}, {true, true},
		{false, true}, {true, true}, {true, false},
	} {
		node.observe(step.probe)
		if node.down != step.down || time.Now().Before(node.readyUntil) != step.probe {
			t.Fatalf("after %+v got %+v", step, node)
		}
	}
}
