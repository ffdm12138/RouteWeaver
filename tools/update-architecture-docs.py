"""Update current-candidate entry points without changing the user's contract.

This maintenance action touches this repository's documentation and manifest
only. Historical evidence and installed client files are deliberately excluded.
"""
from pathlib import Path
import json
import os

ROOT = Path(__file__).resolve().parents[1]
REPORT = 'docs/reports/v14.3/全架构审计与修复.md'
GUIDE = 'docs/guides/本轮修复手动部署.md'
BEGIN = '<!-- ARCHITECTURE_AUDIT_CURRENT:BEGIN -->'
END = '<!-- ARCHITECTURE_AUDIT_CURRENT:END -->'


def main():
    current = json.loads((ROOT/'CURRENT_RELEASE.json').read_text(encoding='utf-8-sig'))
    current.update(architectureRevision='architecture-audit-r1',
        status='CURRENT_SOURCE_STATIC_LIMITED_NATIVE_PASS_DEVICE_PENDING',
        report=REPORT,
        architectureAudit={'revision':'architecture-audit-r1',
            'manifest':'releases/v14.3/validation/architecture-audit/CURRENT_ACCEPTANCE.json',
            'verifier':'tools/verify-current-audit.py',
            'packager':'tools/package-architecture-audit.py',
            'report':REPORT, 'guide':GUIDE,
            'clientDeployment':False, 'systemRoutesChanged':False, 'gitPublished':False,
            'nativeCore':'Mihomo v1.19.33 isolated only',
            'deviceAcceptance':'NOT_VERIFIED',
            'legacyEvidence':'HISTORICAL_ONLY_NOT_REISSUED'})
    (ROOT/'CURRENT_RELEASE.json').write_text(json.dumps(current, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    files = ['README.md','AGENTS.md','GOALS.md','PLANS.md','docs/README.md',
             'docs/status/当前验收.md','docs/maintenance/维护与更新.md',
             'docs/maintenance/开源与发布.md','docs/reference/配置字段归属与验收.md',
             'docs/guides/使用说明.md','docs/guides/自动网络模式.md',
             'docs/guides/IPv4兼容模式.md','docs/guides/MacBook使用说明.md',
             'docs/guides/ClashMi使用说明.md','docs/guides/ClashVerge使用说明.md',
             'releases/v14.3/README.md','releases/v14.3-ipv4-only/README.md']
    for name in files:
        path = ROOT/name
        if not path.is_file():
            continue
        content = path.read_text(encoding='utf-8-sig')
        if BEGIN in content:
            a, b = content.index(BEGIN), content.index(END)+len(END)
            content = (content[:a]+content[b:]).lstrip('\n')
        report = os.path.relpath(ROOT/REPORT, path.parent).replace('\\','/')
        guide = os.path.relpath(ROOT/GUIDE, path.parent).replace('\\','/')
        header = (BEGIN+'\n'
            '> **当前工作区修订：architecture-audit-r1（2026-11-01）**。两轨七客户端的当前源码、有限静态清单及隔离 Windows 核心已验证；跨端设备、原生 auto 能力和真实 AI 账号任务未验收。\n'
            '> 本轮未安装脚本、改动现用客户端、重启服务或发布 GitHub。历史 rc.5–rc.8 段落及旧回执仅作当时记录，不认证本轮新字节。\n'
            '> 当前入口：[全架构审计与修复]('+report+') · [手动部署与验证]('+guide+')。当前候选使用 `tools/verify-current-audit.py` 和 `tools/package-architecture-audit.py`，不重签旧正式发布链。\n'
            +END+'\n\n')
        # Keep original prose, including historical failures, below a clear current boundary.
        path.write_text(header+content, encoding='utf-8')
    changelog = ROOT/'CHANGELOG.md'
    content = changelog.read_text(encoding='utf-8-sig')
    if '## architecture-audit-r1 · 2026-11-01' not in content:
        addition = ('## architecture-audit-r1 · 2026-11-01\n\n'
            '- 修复 Android 精确 API DoH 策略与无 tun 对象时的兼容模式异常。\n'
            '- 修复嗅探排除项所有权、用户规则集重名及网络模式往返幂等。\n'
            '- 严格校验纯 IPv4 LAN DNS 地址与端口；最终配置诊断识别 App 后置覆写及安全告警，控制器禁止重定向。\n'
            '- 新增 160 项架构回归、有限原生协议回放、有界静态分片、候选完整性门禁与新解压测试。\n'
            '- Cloudflare IP 字面量失败在无覆写节点实验中复现，未新增特例绕路；客户端/设备验收保持明确边界。\n\n')
        changelog.write_text(addition+content, encoding='utf-8')
    print(json.dumps({'status':'CURRENT_DOCS_UPDATED','files':len(files)+2,'contractChanged':False},ensure_ascii=False))

if __name__ == '__main__':
    main()
