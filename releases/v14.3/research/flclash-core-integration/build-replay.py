"""Build the owned CLI transport used for isolated tests, never a client core."""
from pathlib import Path
import argparse,json,os,subprocess
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--source',type=Path,required=True,help='Fixed, patched core/Clash.Meta directory')
p.add_argument('--go',default='go');p.add_argument('--output',type=Path,required=True)
a=p.parse_args();source=a.source.resolve();out=a.output.resolve();out.parent.mkdir(parents=True,exist_ok=True)
here=Path(__file__).resolve().parent
overlay=out.with_suffix('.overlay.json')
overlay.write_text(json.dumps({'Replace':{str(source/'main.go'):str(here/'replay-main.go')}}),encoding='utf8')
env=os.environ.copy();env.update({'CGO_ENABLED':'0','GOTOOLCHAIN':'local','GOTELEMETRY':'off','GOMAXPROCS':'2','GOFLAGS':'-mod=readonly'})
subprocess.run([a.go,'build','-overlay',str(overlay),'-p','2','-tags','with_gvisor','-trimpath','-ldflags','-X github.com/metacubex/mihomo/constant.Version=v1.19.32-rw-ipv6-r2-replay-r2 -w -s -buildid=','-o',str(out),'.'],cwd=source,env=env,check=True)
print(json.dumps({'status':'TEST_REPLAY_BUILT','productionClientChanged':False,'tun':'REFUSED_IF_ENABLED'}))
