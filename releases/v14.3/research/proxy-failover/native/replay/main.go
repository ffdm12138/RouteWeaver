// Isolated replay transport for the same configuration and tunnel code used by FlClash.
package main

import (
	"flag"
	"log"
	"os"
	"os/signal"

	"github.com/metacubex/mihomo/adapter/inbound"
	C "github.com/metacubex/mihomo/constant"
	"github.com/metacubex/mihomo/hub"
	"github.com/metacubex/mihomo/hub/executor"
	"github.com/metacubex/mihomo/listener"
	"github.com/metacubex/mihomo/tunnel"
)

func main() {
	home := flag.String("d", "", "isolated working directory")
	file := flag.String("f", "", "synthetic configuration")
	check := flag.Bool("t", false, "parse only")
	flag.Parse()
	C.SetHomeDir(*home)
	cfg, err := executor.ParseWithPath(*file)
	if err != nil {
		log.Fatal(err)
	}
	if cfg.General.Tun.Enable || cfg.General.AllowLan || cfg.General.BindAddress != "127.0.0.1" {
		log.Fatal("replay requires loopback and disabled TUN")
	}
	if *check {
		return
	}
	hub.ApplyConfig(cfg)
	listener.SetAllowLan(false)
	listener.SetBindAddress("127.0.0.1")
	inbound.SetAllowedIPs(cfg.General.LanAllowedIPs)
	inbound.SetDisAllowedIPs(cfg.General.LanDisAllowedIPs)
	inbound.SetSkipAuthPrefixes(cfg.General.SkipAuthPrefixes)
	listener.ReCreateMixed(cfg.General.MixedPort, tunnel.Tunnel)
	interrupt := make(chan os.Signal, 1)
	signal.Notify(interrupt, os.Interrupt)
	<-interrupt
	executor.Shutdown()
}
