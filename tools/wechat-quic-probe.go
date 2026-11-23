// Generate one standard QUIC Initial with a test SNI on loopback.
// Build this file from the pinned ProjectClash module.
package main

import (
	"context"
	"log"
	"net"
	"os"
	"time"

	"github.com/metacubex/quic-go"
	"github.com/metacubex/tls"
)

func main() {
	if len(os.Args) != 2 {
		log.Fatal("usage: wechat-quic-probe <SNI>")
	}
	receiver, err := net.ListenPacket("udp4", "127.0.0.1:0")
	if err != nil {
		log.Fatal(err)
	}
	defer receiver.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	deadline, _ := ctx.Deadline()
	if err := receiver.SetReadDeadline(deadline); err != nil {
		log.Fatal(err)
	}
	go func() {
		_, _ = quic.DialAddr(ctx, receiver.LocalAddr().String(), &tls.Config{
			ServerName:       os.Args[1],
			NextProtos:       []string{"h3"},
			CurvePreferences: []tls.CurveID{tls.CurveP256},
		}, &quic.Config{Versions: []quic.Version{quic.Version1}})
	}()
	packet := make([]byte, 1500)
	length, _, err := receiver.ReadFrom(packet)
	if err != nil {
		log.Fatal(err)
	}
	if _, err := os.Stdout.Write(packet[:length]); err != nil {
		log.Fatal(err)
	}
}
