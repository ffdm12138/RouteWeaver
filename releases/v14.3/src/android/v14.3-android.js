// Small standalone overwrite: critical parents and safety guards inline; complete reviewed rules are remote.
// Mihomo V14.3 android — 2026-10-12; balanced-r1.
// Company rules precede geographic shortcuts; DNS uses the same group.
// Unknown public UDP is proxied or rejected, including arbitrary WebRTC ports.
// Private LAN and the explicit manual DIRECT list are intentional exceptions.
// TUN/VPN capture still requires client settings and device verification.
const V14 = Object.freeze({
  version: "14.3",
  ruleInterval: 86400, // seconds; native core timer, not a JS timer
  ruleSizeLimit: 16777216, // 16 MiB per managed source; native download limit
  testUrl: "https://www.gstatic.com/generate_204",
  testInterval: 600,
  providerInterval: 3600,
  // WebRTC STUN is a separate destination; route known generic STUN through fallback.
  // This cannot identify the site that initiated the WebRTC request.
  stunPorts: ["3478", "5349", "19302-19309"],
  // Whole STUN/TURN labels avoid matching unrelated names such as stunning.cn.
  stunHostPatterns: ["stun.*", "*.stun.*", "turn.*", "*.turn.*"],
  domesticStunDns: ["stun.chat.bilibili.com", "stun.hitv.com"],
  stunDns: ["stun.l.google.com", "stun.services.mozilla.com", "stun.cloudflare.com"],
  infoPattern: "剩余流量|距离下次|套餐到期|建议.*更新|超时.*重启|官网|公告|客服|订阅|流量[:：]|到期[:：]",
  manualDirect: ["shiyi.click"],
  manualProxy: ["net.coffee", "browserleaks.com", "browserleaks.org", "dnsleaktest.com", "dnscheck.tools", "ipleak.net"],
  privateNames: ["localhost", "lan", "local", "localdomain", "home.arpa"],
  directDns: ["https://dns.alidns.com/dns-query#DIRECT", "https://doh.pub/dns-query#DIRECT"],
  nodeDns: [
    "https://223.5.5.5/dns-query#DIRECT",
    "https://223.6.6.6/dns-query#DIRECT",
  ],
  bootstrapDns: ["https://223.5.5.5/dns-query", "https://223.6.6.6/dns-query"],
  // An upstream reachable directly in China and through ordinary proxy nodes.
  groupDnsUrls: ["tls://dns.alidns.com:853", "tls://dot.pub:853"],
});

const V14_BUILTINS = new Set(["DIRECT", "REJECT", "REJECT-DROP", "REJECT-NO-DROP", "PASS", "PASS-RULE", "COMPATIBLE", "GLOBAL"]);
const V14_NOT_NODES = new Set(["direct", "reject", "reject-drop", "reject-no-drop", "pass", "pass-rule", "compatible", "dns", "rematch"]);
const V14_PRIVATE_IPS = [
  "127.0.0.0/8", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "169.254.0.0/16", "100.64.0.0/10",
  "::1/128", "fc00::/7", "fe80::/10",
];
// China-hosted services are fixed DIRECT. TikTok remains a distinct overseas
// selector; broad ByteDance and international Microsoft/Google domains are absent.
// These are deliberately bounded additions from the user's Mojie profile.
const V14_DOMESTIC_SETS = ["douyin", "apple@cn", "google@cn", "microsoft@cn", "steam@cn"];
const V14_DOMESTIC_SEEDS = [
  "douyin.com",
  "douyincdn.com",
  "jianying.com",
  "jimeng.com",
  "toutiao.com",
  "ixigua.com",
  "feishu.cn",
  "volcengine.com",
  "bilibili.com",
  "bilivideo.com",
  "hdslb.com",
  "dl.steam.clngaa.com",
  "st.dl.bscstorage.net",
  "st.dl.eccdnx.com",
  "st.dl.pinyuncloud.com",
  "prts.plus",
  "cnbeta.com",
  "cnbetacdn.com",
  "easou.com",
  "mob.com",
  "baidustatic.com",
  "didi-labs.com"
];
// Immutable approved application DNS destinations; core resolver dialing is independent.
const V14_EXTERNAL_DNS_RULES = [
  "DOMAIN,dns.adguard.com",
  "DOMAIN,dns.adguard-dns.com",
  "DOMAIN,family.adguard-dns.com",
  "DOMAIN,unfiltered.adguard-dns.com",
  "DOMAIN,dns.alidns.com",
  "DOMAIN,doh.dns.apple.com",
  "DOMAIN,dns.caliph.dev",
  "DOMAIN,dns.bebasid.com",
  "DOMAIN,antivirus.bebasid.com",
  "DOMAIN,internetsehat.bebasid.com",
  "DOMAIN,dns.cfiec.net",
  "DOMAIN,doh.cleanbrowsing.org",
  "DOMAIN,one.one.one.one",
  "DOMAIN,dns.cloudflare.com",
  "DOMAIN,freedns.controld.com",
  "DOMAIN,dns.decloudus.com",
  "DOMAIN,futuredns.eu.org",
  "DOMAIN,dns.de.futuredns.eu.org",
  "DOMAIN,dns.us.futuredns.eu.org",
  "DOMAIN,doh.dns.sb",
  "DOMAIN,doh.sb",
  "DOMAIN,dns.sb",
  "DOMAIN,de-dus.doh.sb",
  "DOMAIN,de-fra.doh.sb",
  "DOMAIN,nl-ams.doh.sb",
  "DOMAIN,uk-lon.doh.sb",
  "DOMAIN,ee-tll.doh.sb",
  "DOMAIN,jp-kix.doh.sb",
  "DOMAIN,jp-nrt.doh.sb",
  "DOMAIN,hk-hkg.doh.sb",
  "DOMAIN,au-syd.doh.sb",
  "DOMAIN,us-chi.doh.sb",
  "DOMAIN,us-nyc.doh.sb",
  "DOMAIN,us-sjc.doh.sb",
  "DOMAIN,in-blr.doh.sb",
  "DOMAIN,sg-sin.doh.sb",
  "DOMAIN,kr-sel.doh.sb",
  "DOMAIN,ru-mow.doh.sb",
  "DOMAIN,ca-yyz.doh.sb",
  "DOMAIN,de-ber.doh.sb",
  "DOMAIN,doh.pub",
  "DOMAIN,dns.pub",
  "DOMAIN,sm2.doh.pub",
  "DOMAIN,zero.dns0.eu",
  "DOMAIN,dns.google",
  "DOMAIN,ordns.he.net",
  "DOMAIN,dns.mullvad.net",
  "DOMAIN,adblock.dns.mullvad.net",
  "DOMAIN,base.dns.mullvad.net",
  "DOMAIN,extended.dns.mullvad.net",
  "DOMAIN,family.dns.mullvad.net",
  "DOMAIN,all.dns.mullvad.net",
  "DOMAIN,ada.openbld.net",
  "DOMAIN,ric.openbld.net",
  "DOMAIN,dns.quad9.net",
  "DOMAIN,dns10.quad9.net",
  "DOMAIN,dns11.quad9.net",
  "DOMAIN,doh.qis.io",
  "DOMAIN,dns.rabbitdns.org",
  "DOMAIN,security.rabbitdns.org",
  "DOMAIN,family.rabbitdns.org",
  "DOMAIN,basic.rethinkdns.com",
  "DOMAIN,doh.360.cn",
  "DOMAIN,dns.surfsharkdns.com",
  "DOMAIN,v.recipes",
  "DOMAIN,wikimedia-dns.org",
  "DOMAIN,doh.applied-privacy.net",
  "DOMAIN,private.canadianshield.cira.ca",
  "DOMAIN,protected.canadianshield.cira.ca",
  "DOMAIN,family.canadianshield.cira.ca",
  "DOMAIN,dns.comss.one",
  "DOMAIN,router.comss.one",
  "DOMAIN,odvr.nic.cz",
  "DOMAIN,dns.digitale-gesellschaft.ch",
  "DOMAIN,dns-doh.dnsforfamily.com",
  "DOMAIN,protective.joindns4.eu",
  "DOMAIN,child.joindns4.eu",
  "DOMAIN,noads.joindns4.eu",
  "DOMAIN,child-noads.joindns4.eu",
  "DOMAIN,unfiltered.joindns4.eu",
  "DOMAIN,kaitain.restena.lu",
  "DOMAIN,public.dns.iij.jp",
  "DOMAIN,dns.jupitrdns.com",
  "DOMAIN,doh.libredns.gr",
  "DOMAIN,doh-pure.onedns.net",
  "DOMAIN,doh.onedns.net",
  "DOMAIN,dns.switch.ch",
  "DOMAIN,dns.twnic.tw",
  "DOMAIN,resolver.dnsprivacy.org.uk",
  "DOMAIN,dns.seia.io",
  "DOMAIN,secondary.dns.seia.io",
  "DOMAIN,common.dot.dns.yandex.net",
  "DOMAIN,safe.dot.dns.yandex.net",
  "DOMAIN,family.dot.dns.yandex.net",
  "DOMAIN,dns.shaw.ca",
  "DOMAIN,doh.xfinity.com",
  "DOMAIN,doh.nl.ahadns.net",
  "DOMAIN,doh.la.ahadns.net",
  "DOMAIN,dns.arapurayil.com",
  "DOMAIN,dandelionsprout.asuscomm.com",
  "DOMAIN,dnsforge.de",
  "DOMAIN,dns.dnswarden.com",
  "DOMAIN,doh.ffmuc.net",
  "DOMAIN,ibksturm.synology.me",
  "DOMAIN,resolver-eu.lelux.fi",
  "DOMAIN,dns.marbledfennec.net",
  "DOMAIN,dns.oszx.co",
  "DOMAIN,dns.pumplex.com",
  "DOMAIN,doh.tiarap.org",
  "DOMAIN,doh.tiar.app",
  "DOMAIN,jp.tiarap.org",
  "DOMAIN,jp.tiar.app",
  "DOMAIN,rx.techomespace.com",
  "DOMAIN,public.ns.nwps.fi",
  "DOMAIN,kids.ns.nwps.fi",
  "DOMAIN,dns.astracat.ru",
  "DOMAIN,frd4wvnobp.cloudflare-gateway.com",
  "DOMAIN,dnsguard.pub",
  "DOMAIN,doh.18bit.cn",
  "DOMAIN,5u35p8m9i7.cloudflare-gateway.com",
  "DOMAIN,dns.malw.link",
  "DOMAIN,dns.mafioznik.xyz",
  "DOMAIN,dns.geohide.ru",
  "DOMAIN,xbox-dns.ru",
  "DOMAIN-SUFFIX,opendns.com",
  "DOMAIN-SUFFIX,cloudflare-dns.com",
  "DOMAIN-SUFFIX,nextdns.io"
];

// Google Play can use a .cn API and a separate download CDN. Match both
// before the generic .cn / CN-IP DIRECT rules, and keep their DNS on the
// same selectable Google exit.
const V14_GOOGLE_PLAY_DELIVERY_SEEDS = [
  "googleapis.cn", "xn--ngstr-lra8j.com", "gvt1.com", "gvt2.com", "gvt3.com",
];

// CN IP classification is a managed remote MRS provider below, not a frozen JS snapshot.
// Existing private ranges, Voice endpoints and Telegram dedicated ranges remain embedded.

// OpenAI's published ChatGPT Voice IPv4 list (created 2026-03-26).
// Downloaded and compared on 2026-10-10: all 23 prefixes unchanged.
// Refresh from the official list when it changes; unknown UDP uses
// the no-DIRECT 漏网之鱼 group rather than falling through to DIRECT.
const V14_OPENAI_VOICE_HOSTS = ["chatgpt.livekit.cloud", "host.livekit.cloud", "turn.livekit.cloud"];
// Dynamic LiveKit names do not identify the tenant. Keep known exact hosts
// and official Voice IPs above this safe fallback, across TCP and UDP.
const V14_UNIDENTIFIED_VOICE_SUFFIXES = ["chatgpt.livekit.cloud", "host.livekit.cloud", "turn.livekit.cloud"];
const V14_OPENAI_VOICE_IPV4 = [
  "102.37.57.54/32", "13.71.25.29/32", "135.220.40.201/32", "172.203.39.49/32",
  "172.207.173.200/32", "172.214.226.198/32", "191.233.251.27/32", "20.162.96.163/32",
  "20.168.48.117/32", "20.184.36.134/32", "20.203.144.245/32", "20.74.221.21/32",
  "4.151.200.38/32", "4.155.146.196/32", "4.197.172.116/32", "4.217.235.100/32",
  "4.245.198.13/32", "40.118.236.137/32", "51.4.112.173/32", "52.143.181.161/32",
  "68.155.152.41/32", "72.146.20.246/32", "74.248.148.7/32",
];

// One selectable group per company. Earlier entries win over later domains.
const V14_SERVICES = [
  {
    "name": "OpenAI 服务",
    "sets": [],
    "seeds": [
      "openai.com",
      "chatgpt.com",
      "chat.com",
      "sora.com",
      "oaistatic.com",
      "oaistatsig.com",
      "oaiusercontent.com",
      "chatgpt.site"
    ],
    "exact": [
      "chatgpt.livekit.cloud",
      "host.livekit.cloud",
      "turn.livekit.cloud",
      "openaiapi-site.azureedge.net",
      "openaiassets.blob.core.windows.net",
      "openaicom-api-bdcpf8c6d2e9atf6.z01.azurefd.net",
      "openaicom.imgix.net",
      "openaicomproductionae4b.blob.core.windows.net",
      "production-openaicom-storage.azureedge.net",
      "cdn.openaimerge.com",
      "openai.qualtrics.com",
      "openai.com.cdn.cloudflare.net",
      "chatgpt-async-webps-prod-eastus-1.webpubsub.azure.com",
      "chatgpt-async-webps-prod-eastus-17.webpubsub.azure.com",
      "chatgpt-async-webps-prod-eastus-23.webpubsub.azure.com"
    ]
  },
  {
    "name": "Anthropic 服务",
    "sets": [
      "anthropic"
    ],
    "seeds": [
      "anthropic.com",
      "claude.ai",
      "claude.com",
      "claudeusercontent.com",
      "clau.de",
      "claudemcpclient.com",
      "claudemcpcontent.com"
    ]
  },
  {
    "name": "谷歌服务",
    "sets": [
      "google-gemini",
      "youtube",
      "google"
    ],
    "seeds": [
      "gemini.google.com",
      "aistudio.google.com",
      "generativelanguage.googleapis.com",
      "notebooklm.google.com",
      "notebooklm.google",
      "deepmind.google",
      "generativeai.google",
      "ai.google.dev",
      "jules.google",
      "google.com",
      "googleapis.com",
      "googleapis.cn",
      "gstatic.com",
      "googleusercontent.com",
      "gmail.com",
      "google.com.hk",
      "google.co.jp",
      "google.co.uk",
      "google.com.tw",
      "google.com.sg",
      "youtube.com",
      "youtu.be",
      "googlevideo.com",
      "ytimg.com",
      "youtube-nocookie.com",
      "ggpht.com",
      "gvt1.com",
      "gvt2.com",
      "gvt3.com",
      "xn--ngstr-lra8j.com",
      "android.com",
      "googleplay.com",
      "google-analytics.com",
      "googlezip.net",
      "pki.goog",
      "recaptcha.net",
      "doubleclick.net",
      "googlesyndication.com",
      "googleadservices.com",
      "googletagmanager.com",
      "firebase.google.com",
      "googlecloud.com",
      "cloud.google.com",
      "waze.com",
      "fitbit.com",
      "nest.com",
      "blogger.com",
      "blogspot.com",
      "withgoogle.com"
    ]
  },
  {
    "name": "OpenRouter",
    "sets": [],
    "seeds": [
      "openrouter.ai"
    ]
  },
  {
    "name": "Perplexity",
    "sets": [],
    "seeds": [
      "perplexity.ai",
      "perplexity.com",
      "pplx.ai"
    ],
    "exact": [
      "ppl-ai-file-upload.s3.amazonaws.com",
      "pplx-res.cloudinary.com"
    ]
  },
  {
    "name": "Hugging Face",
    "sets": [],
    "seeds": [
      "huggingface.co",
      "hf.co",
      "hf.space"
    ]
  },
  {
    "name": "xAI",
    "sets": [],
    "seeds": [
      "x.ai",
      "grok.com",
      "grok.me"
    ]
  },
  {
    "name": "Netflix",
    "sets": [
      "netflix"
    ],
    "ips": [
      "netflix"
    ],
    "seeds": [
      "netflix.com",
      "nflxvideo.net",
      "nflximg.net",
      "nflxext.com",
      "nflxso.net",
      "nflximg.com",
      "netflix.net"
    ]
  },
  {
    "name": "Disney+",
    "sets": [
      "disney"
    ],
    "seeds": [
      "disneyplus.com",
      "dssott.com",
      "bamgrid.com"
    ],
    "exact": [
      "hses.akamaized.net",
      "hses1.akamaized.net",
      "hses2.akamaized.net",
      "hses3.akamaized.net",
      "hses4.akamaized.net",
      "hses5.akamaized.net",
      "hses6.akamaized.net",
      "hses7.akamaized.net"
    ]
  },
  {
    "name": "Spotify",
    "sets": [
      "spotify"
    ],
    "seeds": [
      "spotify.com",
      "scdn.co",
      "spotifycdn.com",
      "spotifycdn.net"
    ]
  },
  {
    "name": "Telegram",
    "sets": [
      "telegram"
    ],
    "ips": [
      "telegram"
    ],
    "seeds": [
      "telegram.org",
      "t.me",
      "telegra.ph",
      "cdn-telegram.org",
      "telegram.me",
      "tdesktop.com",
      "telegram-cdn.org"
    ]
  },
  {
    "name": "Discord",
    "sets": [
      "discord"
    ],
    "seeds": [
      "discord.com",
      "discord.gg",
      "discordapp.com",
      "discordapp.net",
      "discord.media",
      "discordapp.io",
      "discordcdn.com"
    ]
  },
  {
    "name": "TikTok",
    "sets": [
      "tiktok"
    ],
    "seeds": [
      "tiktok.com",
      "tiktokcdn.com",
      "tiktokv.com",
      "tiktokcdn-us.com",
      "byteoversea.com",
      "ibytedtos.com",
      "musical.ly",
      "muscdn.com",
      "capcut.com",
      "larksuite.com",
      "trae.ai",
      "tiktokd.net"
    ]
  },
  {
    "name": "Twitter",
    "sets": [
      "twitter"
    ],
    "ips": [
      "twitter"
    ],
    "seeds": [
      "x.com",
      "twitter.com",
      "twimg.com",
      "t.co",
      "tweetdeck.com"
    ]
  },
  {
    "name": "Meta 服务",
    "sets": [
      "meta"
    ],
    "seeds": [
      "facebook.com",
      "fb.com",
      "fb.me",
      "fbcdn.net",
      "fbsbx.com",
      "messenger.com",
      "instagram.com",
      "cdninstagram.com",
      "whatsapp.com",
      "whatsapp.net",
      "threads.net",
      "threads.com",
      "meta.com",
      "meta.ai",
      "oculus.com",
      "wa.me"
    ]
  },
  {
    "name": "Steam",
    "sets": [
      "steam"
    ],
    "seeds": [
      "steamcontent.com",
      "dl.steam.clngaa.com",
      "st.dl.bscstorage.net",
      "st.dl.eccdnx.com",
      "st.dl.pinyuncloud.com",
      "steampowered.com",
      "steamcommunity.com",
      "steamstatic.com",
      "steamserver.net",
      "steamusercontent.com",
      "s.team",
      "steam-chat.com"
    ],
    "exact": [
      "steamcdn-a.akamaihd.net",
      "steampipe.akamaized.net",
      "steampipe-partner.akamaized.net"
    ]
  },
  {
    "name": "Epic Games",
    "sets": [
      "epicgames"
    ],
    "seeds": [
      "epicgames.com",
      "epicgames.dev",
      "epicgamescdn.com",
      "fortnite.com",
      "unrealengine.com"
    ],
    "exact": [
      "epicgames-download0.akamaized.net",
      "epicgames-download1.akamaized.net",
      "epicgames-download2.akamaized.net",
      "epicgames-download3.akamaized.net",
      "epicgames-download4.akamaized.net",
      "epicgames-download5.akamaized.net",
      "epicgames-download6.akamaized.net",
      "epicgames-download7.akamaized.net",
      "epicgames-download8.akamaized.net",
      "epicgames-download9.akamaized.net",
      "cdn0-epicgames-0.file.myqcloud.com",
      "cdn0-epicgames-1.file.myqcloud.com",
      "cdn0-epicgames-17.file.myqcloud.com",
      "cdn0-epicgames-23.file.myqcloud.com",
      "cdn0-epicgames-999.file.myqcloud.com",
      "cdn1-epicgames-0.file.myqcloud.com",
      "cdn1-epicgames-1.file.myqcloud.com",
      "cdn1-epicgames-17.file.myqcloud.com",
      "cdn1-epicgames-23.file.myqcloud.com",
      "cdn1-epicgames-999.file.myqcloud.com",
      "cdn2-epicgames-0.file.myqcloud.com",
      "cdn2-epicgames-1.file.myqcloud.com",
      "cdn2-epicgames-17.file.myqcloud.com",
      "cdn2-epicgames-23.file.myqcloud.com",
      "cdn2-epicgames-999.file.myqcloud.com",
      "cdn3-epicgames-0.file.myqcloud.com",
      "cdn3-epicgames-1.file.myqcloud.com",
      "cdn3-epicgames-17.file.myqcloud.com",
      "cdn3-epicgames-23.file.myqcloud.com",
      "cdn3-epicgames-999.file.myqcloud.com",
      "cdn4-epicgames-0.file.myqcloud.com",
      "cdn4-epicgames-1.file.myqcloud.com",
      "cdn4-epicgames-17.file.myqcloud.com",
      "cdn4-epicgames-23.file.myqcloud.com",
      "cdn4-epicgames-999.file.myqcloud.com",
      "cdn5-epicgames-0.file.myqcloud.com",
      "cdn5-epicgames-1.file.myqcloud.com",
      "cdn5-epicgames-17.file.myqcloud.com",
      "cdn5-epicgames-23.file.myqcloud.com",
      "cdn5-epicgames-999.file.myqcloud.com",
      "cdn6-epicgames-0.file.myqcloud.com",
      "cdn6-epicgames-1.file.myqcloud.com",
      "cdn6-epicgames-17.file.myqcloud.com",
      "cdn6-epicgames-23.file.myqcloud.com",
      "cdn6-epicgames-999.file.myqcloud.com",
      "cdn7-epicgames-0.file.myqcloud.com",
      "cdn7-epicgames-1.file.myqcloud.com",
      "cdn7-epicgames-17.file.myqcloud.com",
      "cdn7-epicgames-23.file.myqcloud.com",
      "cdn7-epicgames-999.file.myqcloud.com",
      "cdn8-epicgames-0.file.myqcloud.com",
      "cdn8-epicgames-1.file.myqcloud.com",
      "cdn8-epicgames-17.file.myqcloud.com",
      "cdn8-epicgames-23.file.myqcloud.com",
      "cdn8-epicgames-999.file.myqcloud.com",
      "cdn9-epicgames-0.file.myqcloud.com",
      "cdn9-epicgames-1.file.myqcloud.com",
      "cdn9-epicgames-17.file.myqcloud.com",
      "cdn9-epicgames-23.file.myqcloud.com",
      "cdn9-epicgames-999.file.myqcloud.com",
      "epicgames-download0-0.file.myqcloud.com",
      "epicgames-download0-1.file.myqcloud.com",
      "epicgames-download0-17.file.myqcloud.com",
      "epicgames-download0-23.file.myqcloud.com",
      "epicgames-download0-999.file.myqcloud.com",
      "epicgames-download1-0.file.myqcloud.com",
      "epicgames-download1-1.file.myqcloud.com",
      "epicgames-download1-17.file.myqcloud.com",
      "epicgames-download1-23.file.myqcloud.com",
      "epicgames-download1-999.file.myqcloud.com",
      "epicgames-download2-0.file.myqcloud.com",
      "epicgames-download2-1.file.myqcloud.com",
      "epicgames-download2-17.file.myqcloud.com",
      "epicgames-download2-23.file.myqcloud.com",
      "epicgames-download2-999.file.myqcloud.com",
      "epicgames-download3-0.file.myqcloud.com",
      "epicgames-download3-1.file.myqcloud.com",
      "epicgames-download3-17.file.myqcloud.com",
      "epicgames-download3-23.file.myqcloud.com",
      "epicgames-download3-999.file.myqcloud.com",
      "epicgames-download4-0.file.myqcloud.com",
      "epicgames-download4-1.file.myqcloud.com",
      "epicgames-download4-17.file.myqcloud.com",
      "epicgames-download4-23.file.myqcloud.com",
      "epicgames-download4-999.file.myqcloud.com",
      "epicgames-download5-0.file.myqcloud.com",
      "epicgames-download5-1.file.myqcloud.com",
      "epicgames-download5-17.file.myqcloud.com",
      "epicgames-download5-23.file.myqcloud.com",
      "epicgames-download5-999.file.myqcloud.com",
      "epicgames-download6-0.file.myqcloud.com",
      "epicgames-download6-1.file.myqcloud.com",
      "epicgames-download6-17.file.myqcloud.com",
      "epicgames-download6-23.file.myqcloud.com",
      "epicgames-download6-999.file.myqcloud.com",
      "epicgames-download7-0.file.myqcloud.com",
      "epicgames-download7-1.file.myqcloud.com",
      "epicgames-download7-17.file.myqcloud.com",
      "epicgames-download7-23.file.myqcloud.com",
      "epicgames-download7-999.file.myqcloud.com",
      "epicgames-download8-0.file.myqcloud.com",
      "epicgames-download8-1.file.myqcloud.com",
      "epicgames-download8-17.file.myqcloud.com",
      "epicgames-download8-23.file.myqcloud.com",
      "epicgames-download8-999.file.myqcloud.com",
      "epicgames-download9-0.file.myqcloud.com",
      "epicgames-download9-1.file.myqcloud.com",
      "epicgames-download9-17.file.myqcloud.com",
      "epicgames-download9-23.file.myqcloud.com",
      "epicgames-download9-999.file.myqcloud.com"
    ]
  },
  {
    "name": "微软生态",
    "sets": [
      "microsoft",
      "linkedin",
      "linkedin"
    ],
    "seeds": [
      "microsoft.com",
      "microsoftonline.com",
      "microsoftstore.com",
      "windows.com",
      "windowsupdate.com",
      "update.microsoft.com",
      "office.com",
      "office.net",
      "office365.com",
      "live.com",
      "aka.ms",
      "onedrive.com",
      "sharepoint.com",
      "msftconnecttest.com",
      "msftncsi.com",
      "bing.com",
      "copilot.microsoft.com",
      "copilot.bing.com",
      "githubcopilot.com",
      "github.com",
      "githubusercontent.com",
      "githubassets.com",
      "microsoftazure.com",
      "msn.com",
      "skype.com",
      "linkedin.com",
      "licdn.com",
      "xbox.com",
      "xboxlive.com"
    ],
    "exact": [
      "go.microsoft.com",
      "download.microsoft.com",
      "download.windowsupdate.com",
      "software.download.prss.microsoft.com",
      "dl.delivery.mp.microsoft.com",
      "fe3.delivery.mp.microsoft.com",
      "storeedgefd.dsx.mp.microsoft.com",
      "bingsettingssearch.trafficmanager.net",
      "dtlgalleryint.cloudapp.net",
      "poshtestgallery.cloudapp.net",
      "psg-int-centralus.cloudapp.net",
      "psg-int-eastus.cloudapp.net",
      "vscode-sync-insiders.trafficmanager.net",
      "vscode-sync.trafficmanager.net"
    ]
  },
  {
    "name": "苹果国际",
    "sets": [
      "apple"
    ],
    "seeds": [
      "apple.com",
      "apple.com.cn",
      "aaplimg.com",
      "icloud.com",
      "icloud-content.com",
      "apple-cloudkit.com",
      "mzstatic.com",
      "cdn-apple.com",
      "apple-dns.net",
      "itunes.com",
      "appstore.com",
      "apple-dns.cn"
    ],
    "exact": [
      "swcdn.apple.com",
      "swdist.apple.com",
      "swdownload.apple.com",
      "swscan.apple.com",
      "oscdn.apple.com",
      "osrecovery.apple.com",
      "updates.cdn-apple.com",
      "updates-http.cdn-apple.com",
      "gdmf-ados.apple.com",
      "gsra.apple.com",
      "wkms-public.apple.com",
      "fcs-keys-pub-prod.cdn-apple.com"
    ]
  },
  {
    "name": "哔哩国际",
    "sets": [
      "bilibili"
    ],
    "seeds": [
      "bilibili.com",
      "bilivideo.com",
      "hdslb.com",
      "bilibili.tv",
      "biliintl.com",
      "b23.tv"
    ]
  }
];

// Shared web dependencies have their own selector. Domain rules cannot infer
// which top-level site requested them, so keep these out of company groups.
const V14_SHARED_INFRA = {
  "name": "公共基础服务",
  "sets": [],
  "seeds": [
    "workos.com",
    "workoscdn.com",
    "stripe.com",
    "stripe.network",
    "browser-intake-datadoghq.com",
    "sentry.io",
    "intercom.io",
    "intercomcdn.com",
    "ct.sendgrid.net",
    "auth0.com",
    "livekit.cloud",
    "cdn.cloudflare.net",
    "cloudflare.com",
    "webpubsub.azure.com",
    "blob.core.windows.net",
    "azurewebsites.net",
    "azurestaticapps.net",
    "azureedge.net",
    "azurefd.net",
    "appspot.com",
    "firebaseio.com",
    "firebaseapp.com",
    "run.app",
    "pages.dev",
    "workers.dev",
    "r2.dev",
    "cloudfront.net",
    "amazonaws.com",
    "cloudinary.com",
    "imgix.net",
    "arkoselabs.com",
    "usefathom.com",
    "sendgrid.net",
    "qualtrics.com",
    "github.io",
    "githubpreview.dev",
    "cloudapp.net",
    "cloudapp.azure.com",
    "azure-api.net",
    "azurecontainer.io",
    "trafficmanager.net",
    "azurecr.io",
    "cosmos.azure.com",
    "documents.azure.com",
    "vault.azure.net",
    "azmk8s.io",
    "servicebus.windows.net",
    "database.windows.net",
    "file.core.windows.net",
    "queue.core.windows.net",
    "table.core.windows.net",
    "web.core.windows.net",
    "dfs.core.windows.net",
    "chinacloudapp.cn",
    "blob.core.chinacloudapi.cn",
    "queue.core.chinacloudapi.cn",
    "table.core.chinacloudapi.cn",
    "dfs.core.chinacloudapi.cn",
    "database.chinacloudapi.cn",
    "servicebus.chinacloudapi.cn",
    "vault.azure.cn",
    "azure-api.cn",
    "cloudfunctions.net",
    "storage.googleapis.com",
    "content-storage.googleapis.com",
    "storage.cloud.google.com",
    "storage.mtls.googleapis.com",
    "storage.mtls.cloud.google.com"
  ],
  "exact": [
    "challenges.cloudflare.com",
    "workos.imgix.net"
  ]
};


// Immutable company classifiers, generated from data/rules/company-core.json.
const V14_CDN_SHARED_GUARDS = [
  "DOMAIN-REGEX,^cdn.*-epicgames-.*\\.file\\.myqcloud\\.com$",
  "DOMAIN-REGEX,^epicgames-download.*-.*\\.file\\.myqcloud\\.com$"
];

// Generated reviewed domain snapshots; standalone clients need no local files.
const V14_REVIEWED_DOMAINS = {
  "private": {
    "behavior": "classical",
    "payloadText": "DOMAIN,instant.arubanetworks.com\nDOMAIN,setmeup.arubanetworks.com\nDOMAIN,asusrouter.com\nDOMAIN,router.asus.com\nDOMAIN,www.asusrouter.com\nDOMAIN,oasisauth.h3c.com\nDOMAIN,routerlogin.com\nDOMAIN,www.routerlogin.com\nDOMAIN,tplogin.cn\nDOMAIN,miwifi.com\nDOMAIN,www.miwifi.com\nDOMAIN,local.adguard.org\nDOMAIN-SUFFIX,internal\nDOMAIN-SUFFIX,localdomain\nDOMAIN-SUFFIX,example\nDOMAIN-SUFFIX,invalid\nDOMAIN-SUFFIX,localhost\nDOMAIN-SUFFIX,test\nDOMAIN-SUFFIX,local\nDOMAIN-SUFFIX,lan\nDOMAIN-SUFFIX,router.ctc\nDOMAIN-SUFFIX,my.router\nDOMAIN-SUFFIX,home.arpa\nDOMAIN-SUFFIX,zte.home\nDOMAIN-SUFFIX,tplinkwifi.net\nDOMAIN-SUFFIX,tendawifi.com\nDOMAIN-SUFFIX,plex.direct\nDOMAIN-SUFFIX,hiwifi.com\nDOMAIN-SUFFIX,phicomm.me\nDOMAIN-SUFFIX,peiluyou.com\nDOMAIN-SUFFIX,ts.net\nDOMAIN-SUFFIX,leike.cc\nDOMAIN-SUFFIX,127.in-addr.arpa\nDOMAIN-SUFFIX,10.in-addr.arpa\nDOMAIN-SUFFIX,82.100.in-addr.arpa\nDOMAIN-SUFFIX,93.100.in-addr.arpa\nDOMAIN-SUFFIX,29.172.in-addr.arpa\nDOMAIN-SUFFIX,30.172.in-addr.arpa\nDOMAIN-SUFFIX,31.172.in-addr.arpa\nDOMAIN-SUFFIX,16.172.in-addr.arpa\nDOMAIN-SUFFIX,17.172.in-addr.arpa\nDOMAIN-SUFFIX,27.172.in-addr.arpa\nDOMAIN-SUFFIX,168.192.in-addr.arpa\nDOMAIN-SUFFIX,254.169.in-addr.arpa\nDOMAIN-SUFFIX,18.172.in-addr.arpa\nDOMAIN-SUFFIX,localhost.ptlogin2.qq.com\nDOMAIN-SUFFIX,localhost.sec.qq.com\nDOMAIN-SUFFIX,19.172.in-addr.arpa\nDOMAIN-SUFFIX,20.172.in-addr.arpa\nDOMAIN-SUFFIX,21.172.in-addr.arpa\nDOMAIN-SUFFIX,22.172.in-addr.arpa\nDOMAIN-SUFFIX,d.f.ip6.arpa\nDOMAIN-SUFFIX,64.100.in-addr.arpa\nDOMAIN-SUFFIX,65.100.in-addr.arpa\nDOMAIN-SUFFIX,66.100.in-addr.arpa\nDOMAIN-SUFFIX,67.100.in-addr.arpa\nDOMAIN-SUFFIX,68.100.in-addr.arpa\nDOMAIN-SUFFIX,69.100.in-addr.arpa\nDOMAIN-SUFFIX,70.100.in-addr.arpa\nDOMAIN-SUFFIX,71.100.in-addr.arpa\nDOMAIN-SUFFIX,72.100.in-addr.arpa\nDOMAIN-SUFFIX,73.100.in-addr.arpa\nDOMAIN-SUFFIX,74.100.in-addr.arpa\nDOMAIN-SUFFIX,75.100.in-addr.arpa\nDOMAIN-SUFFIX,76.100.in-addr.arpa\nDOMAIN-SUFFIX,77.100.in-addr.arpa\nDOMAIN-SUFFIX,78.100.in-addr.arpa\nDOMAIN-SUFFIX,79.100.in-addr.arpa\nDOMAIN-SUFFIX,80.100.in-addr.arpa\nDOMAIN-SUFFIX,81.100.in-addr.arpa\nDOMAIN-SUFFIX,26.172.in-addr.arpa\nDOMAIN-SUFFIX,83.100.in-addr.arpa\nDOMAIN-SUFFIX,84.100.in-addr.arpa\nDOMAIN-SUFFIX,85.100.in-addr.arpa\nDOMAIN-SUFFIX,86.100.in-addr.arpa\nDOMAIN-SUFFIX,87.100.in-addr.arpa\nDOMAIN-SUFFIX,88.100.in-addr.arpa\nDOMAIN-SUFFIX,89.100.in-addr.arpa\nDOMAIN-SUFFIX,90.100.in-addr.arpa\nDOMAIN-SUFFIX,91.100.in-addr.arpa\nDOMAIN-SUFFIX,92.100.in-addr.arpa\nDOMAIN-SUFFIX,28.172.in-addr.arpa\nDOMAIN-SUFFIX,94.100.in-addr.arpa\nDOMAIN-SUFFIX,95.100.in-addr.arpa\nDOMAIN-SUFFIX,96.100.in-addr.arpa\nDOMAIN-SUFFIX,97.100.in-addr.arpa\nDOMAIN-SUFFIX,98.100.in-addr.arpa\nDOMAIN-SUFFIX,99.100.in-addr.arpa\nDOMAIN-SUFFIX,100.100.in-addr.arpa\nDOMAIN-SUFFIX,101.100.in-addr.arpa\nDOMAIN-SUFFIX,102.100.in-addr.arpa\nDOMAIN-SUFFIX,103.100.in-addr.arpa\nDOMAIN-SUFFIX,104.100.in-addr.arpa\nDOMAIN-SUFFIX,105.100.in-addr.arpa\nDOMAIN-SUFFIX,106.100.in-addr.arpa\nDOMAIN-SUFFIX,107.100.in-addr.arpa\nDOMAIN-SUFFIX,108.100.in-addr.arpa\nDOMAIN-SUFFIX,109.100.in-addr.arpa\nDOMAIN-SUFFIX,110.100.in-addr.arpa\nDOMAIN-SUFFIX,111.100.in-addr.arpa\nDOMAIN-SUFFIX,112.100.in-addr.arpa\nDOMAIN-SUFFIX,113.100.in-addr.arpa\nDOMAIN-SUFFIX,114.100.in-addr.arpa\nDOMAIN-SUFFIX,115.100.in-addr.arpa\nDOMAIN-SUFFIX,116.100.in-addr.arpa\nDOMAIN-SUFFIX,117.100.in-addr.arpa\nDOMAIN-SUFFIX,118.100.in-addr.arpa\nDOMAIN-SUFFIX,119.100.in-addr.arpa\nDOMAIN-SUFFIX,120.100.in-addr.arpa\nDOMAIN-SUFFIX,121.100.in-addr.arpa\nDOMAIN-SUFFIX,122.100.in-addr.arpa\nDOMAIN-SUFFIX,123.100.in-addr.arpa\nDOMAIN-SUFFIX,124.100.in-addr.arpa\nDOMAIN-SUFFIX,125.100.in-addr.arpa\nDOMAIN-SUFFIX,126.100.in-addr.arpa\nDOMAIN-SUFFIX,127.100.in-addr.arpa\nDOMAIN-SUFFIX,25.172.in-addr.arpa\nDOMAIN-SUFFIX,24.172.in-addr.arpa\nDOMAIN-SUFFIX,23.172.in-addr.arpa\nDOMAIN-SUFFIX,b.e.f.ip6.arpa\nDOMAIN-SUFFIX,a.e.f.ip6.arpa\nDOMAIN-SUFFIX,9.e.f.ip6.arpa\nDOMAIN-SUFFIX,8.e.f.ip6.arpa\nDOMAIN-SUFFIX,113.0.203.in-addr.arpa\nDOMAIN-SUFFIX,100.51.198.in-addr.arpa\nDOMAIN-SUFFIX,2.0.192.in-addr.arpa\nDOMAIN-SUFFIX,kis.v2.scr.kaspersky-labs.com\nDOMAIN-SUFFIX,255.255.255.255.in-addr.arpa\nDOMAIN-SUFFIX,8.b.d.0.1.0.0.2.ip6.arpa\nDOMAIN-SUFFIX,1.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.ip6.arpa\nDOMAIN-REGEX,^[a-z]([a-z0-9-]{0,61}[a-z0-9])?$"
  },
  "category-doh": {
    "behavior": "classical",
    "payloadText": "DOMAIN,dns.adguard.com\nDOMAIN,dns.adguard-dns.com\nDOMAIN,family.adguard-dns.com\nDOMAIN,unfiltered.adguard-dns.com\nDOMAIN,dns.alidns.com\nDOMAIN,doh.dns.apple.com\nDOMAIN,dns.caliph.dev\nDOMAIN,dns.bebasid.com\nDOMAIN,antivirus.bebasid.com\nDOMAIN,internetsehat.bebasid.com\nDOMAIN,dns.cfiec.net\nDOMAIN,doh.cleanbrowsing.org\nDOMAIN,one.one.one.one\nDOMAIN,dns.cloudflare.com\nDOMAIN,freedns.controld.com\nDOMAIN,dns.decloudus.com\nDOMAIN,futuredns.eu.org\nDOMAIN,dns.de.futuredns.eu.org\nDOMAIN,dns.us.futuredns.eu.org\nDOMAIN,doh.dns.sb\nDOMAIN,doh.sb\nDOMAIN,dns.sb\nDOMAIN,de-dus.doh.sb\nDOMAIN,de-fra.doh.sb\nDOMAIN,nl-ams.doh.sb\nDOMAIN,uk-lon.doh.sb\nDOMAIN,ee-tll.doh.sb\nDOMAIN,jp-kix.doh.sb\nDOMAIN,jp-nrt.doh.sb\nDOMAIN,hk-hkg.doh.sb\nDOMAIN,au-syd.doh.sb\nDOMAIN,us-chi.doh.sb\nDOMAIN,us-nyc.doh.sb\nDOMAIN,us-sjc.doh.sb\nDOMAIN,in-blr.doh.sb\nDOMAIN,sg-sin.doh.sb\nDOMAIN,kr-sel.doh.sb\nDOMAIN,ru-mow.doh.sb\nDOMAIN,ca-yyz.doh.sb\nDOMAIN,de-ber.doh.sb\nDOMAIN,doh.pub\nDOMAIN,dns.pub\nDOMAIN,sm2.doh.pub\nDOMAIN,zero.dns0.eu\nDOMAIN,dns.google\nDOMAIN,ordns.he.net\nDOMAIN,dns.mullvad.net\nDOMAIN,adblock.dns.mullvad.net\nDOMAIN,base.dns.mullvad.net\nDOMAIN,extended.dns.mullvad.net\nDOMAIN,family.dns.mullvad.net\nDOMAIN,all.dns.mullvad.net\nDOMAIN,ada.openbld.net\nDOMAIN,ric.openbld.net\nDOMAIN,dns.quad9.net\nDOMAIN,dns10.quad9.net\nDOMAIN,dns11.quad9.net\nDOMAIN,doh.qis.io\nDOMAIN,dns.rabbitdns.org\nDOMAIN,security.rabbitdns.org\nDOMAIN,family.rabbitdns.org\nDOMAIN,basic.rethinkdns.com\nDOMAIN,doh.360.cn\nDOMAIN,dns.surfsharkdns.com\nDOMAIN,v.recipes\nDOMAIN,wikimedia-dns.org\nDOMAIN,doh.applied-privacy.net\nDOMAIN,private.canadianshield.cira.ca\nDOMAIN,protected.canadianshield.cira.ca\nDOMAIN,family.canadianshield.cira.ca\nDOMAIN,dns.comss.one\nDOMAIN,router.comss.one\nDOMAIN,odvr.nic.cz\nDOMAIN,dns.digitale-gesellschaft.ch\nDOMAIN,dns-doh.dnsforfamily.com\nDOMAIN,protective.joindns4.eu\nDOMAIN,child.joindns4.eu\nDOMAIN,noads.joindns4.eu\nDOMAIN,child-noads.joindns4.eu\nDOMAIN,unfiltered.joindns4.eu\nDOMAIN,kaitain.restena.lu\nDOMAIN,public.dns.iij.jp\nDOMAIN,dns.jupitrdns.com\nDOMAIN,doh.libredns.gr\nDOMAIN,doh-pure.onedns.net\nDOMAIN,doh.onedns.net\nDOMAIN,dns.switch.ch\nDOMAIN,dns.twnic.tw\nDOMAIN,resolver.dnsprivacy.org.uk\nDOMAIN,dns.seia.io\nDOMAIN,secondary.dns.seia.io\nDOMAIN,common.dot.dns.yandex.net\nDOMAIN,safe.dot.dns.yandex.net\nDOMAIN,family.dot.dns.yandex.net\nDOMAIN,dns.shaw.ca\nDOMAIN,doh.xfinity.com\nDOMAIN,doh.nl.ahadns.net\nDOMAIN,doh.la.ahadns.net\nDOMAIN,dns.arapurayil.com\nDOMAIN,dandelionsprout.asuscomm.com\nDOMAIN,dnsforge.de\nDOMAIN,dns.dnswarden.com\nDOMAIN,doh.ffmuc.net\nDOMAIN,ibksturm.synology.me\nDOMAIN,resolver-eu.lelux.fi\nDOMAIN,dns.marbledfennec.net\nDOMAIN,dns.oszx.co\nDOMAIN,dns.pumplex.com\nDOMAIN,doh.tiarap.org\nDOMAIN,doh.tiar.app\nDOMAIN,jp.tiarap.org\nDOMAIN,jp.tiar.app\nDOMAIN,rx.techomespace.com\nDOMAIN,public.ns.nwps.fi\nDOMAIN,kids.ns.nwps.fi\nDOMAIN,dns.astracat.ru\nDOMAIN,frd4wvnobp.cloudflare-gateway.com\nDOMAIN,dnsguard.pub\nDOMAIN,doh.18bit.cn\nDOMAIN,5u35p8m9i7.cloudflare-gateway.com\nDOMAIN,dns.malw.link\nDOMAIN,dns.mafioznik.xyz\nDOMAIN,dns.geohide.ru\nDOMAIN,xbox-dns.ru\nDOMAIN-SUFFIX,opendns.com\nDOMAIN-SUFFIX,cloudflare-dns.com\nDOMAIN-SUFFIX,nextdns.io"
  },
  "cn": {
    "behavior": "domain",
    "payloadText": "+.baidu.com\n+.bdstatic.com\n+.bdimg.com\n+.qq.com\n+.qpic.cn\n+.gtimg.com\n+.weixin.qq.com\n+.taobao.com\n+.tmall.com\n+.alicdn.com\n+.alipay.com\n+.jd.com\n+.360buyimg.com\n+.weibo.com\n+.weibo.cn\n+.sina.com.cn\n+.zhihu.com\n+.zhimg.com\n+.163.com\n+.126.com\n+.127.net\n+.netease.com\n+.douban.com\n+.doubanio.com\n+.amap.com\n+.autonavi.com\n+.meituan.com\n+.dianping.com\n+.ele.me\n+.ctrip.com\n+.qunar.com\n+.csdn.net\n+.gitee.com\n+.mi.com\n+.xiaomi.com\n+.10010.com\n+.10086.cn\n+.10086.com\n+.189.cn\n+.iqiyi.com\n+.youku.com\n+.pinduoduo.com\n+.pddpic.com\n+.suning.com\n+.360.cn\n+.360.com\n+.sogou.com\n+.sohu.com\n+.bcebos.com\n+.xiaohongshu.com\n+.xhscdn.com"
  }
};

const V14_COMPANY_CORE = {
  "OpenAI 服务": [
    "DOMAIN-SUFFIX,oaiusercontent.com",
    "DOMAIN-SUFFIX,chatgpt.com",
    "DOMAIN-SUFFIX,chatgpt.site",
    "DOMAIN-SUFFIX,oaistatic.com",
    "DOMAIN-SUFFIX,oaistatsig.com",
    "DOMAIN-SUFFIX,chat.com",
    "DOMAIN-SUFFIX,openai.com",
    "DOMAIN-SUFFIX,sora.com",
    "DOMAIN,chatgpt-async-webps-prod-eastus-1.webpubsub.azure.com",
    "DOMAIN,chatgpt-async-webps-prod-eastus-17.webpubsub.azure.com",
    "DOMAIN,chatgpt-async-webps-prod-eastus-23.webpubsub.azure.com"
  ],
  "Anthropic 服务": [
    "DOMAIN,servd-anthropic-website.b-cdn.net",
    "DOMAIN-SUFFIX,anthropic.com",
    "DOMAIN-SUFFIX,clau.de",
    "DOMAIN-SUFFIX,claude.ai",
    "DOMAIN-SUFFIX,claude.com",
    "DOMAIN-SUFFIX,claude.dev",
    "DOMAIN-SUFFIX,claudemcpclient.com",
    "DOMAIN-SUFFIX,claudemcpcontent.com",
    "DOMAIN-SUFFIX,claudeusercontent.com"
  ],
  "谷歌服务": [
    "DOMAIN,ai.google.dev",
    "DOMAIN,alkalicore-pa.clients6.google.com",
    "DOMAIN,alkalimakersuite-pa.clients6.google.com",
    "DOMAIN,webchannel-alkalimakersuite-pa.clients6.google.com",
    "DOMAIN,geminiweb-pa.clients.google.com",
    "DOMAIN,geminiweb-pa.clients6.google.com",
    "DOMAIN,cloudaicompanion.googleapis.com",
    "DOMAIN,cloudcode-pa.googleapis.com",
    "DOMAIN,daily-cloudcode-pa.googleapis.com",
    "DOMAIN,notebooklm-pa.googleapis.com",
    "DOMAIN,notebooklm.googleapis.com",
    "DOMAIN,antigravity-pa.googleapis.com",
    "DOMAIN,antigravity.googleapis.com",
    "DOMAIN-SUFFIX,deepmind.google",
    "DOMAIN-SUFFIX,generativeai.google",
    "DOMAIN-SUFFIX,jules.google",
    "DOMAIN-SUFFIX,notebooklm.google",
    "DOMAIN-SUFFIX,gemini.google.com",
    "DOMAIN-SUFFIX,notebooklm.google.com",
    "DOMAIN-SUFFIX,aistudio.google.com",
    "DOMAIN-SUFFIX,generativelanguage.googleapis.com",
    "DOMAIN,yt3.googleusercontent.com",
    "DOMAIN-SUFFIX,ytimg.com",
    "DOMAIN-SUFFIX,youtu.be",
    "DOMAIN-SUFFIX,youtube-nocookie.com",
    "DOMAIN-SUFFIX,ggpht.com",
    "DOMAIN-SUFFIX,youtube.com",
    "DOMAIN-SUFFIX,googlevideo.com",
    "DOMAIN,google-ohttp-relay-safebrowsing.fastly-edge.com",
    "DOMAIN,firebase.googleapis.com",
    "DOMAIN,firebaseappcheck.googleapis.com",
    "DOMAIN,firebaseappdistribution.googleapis.com",
    "DOMAIN,firebaseapptesters.googleapis.com",
    "DOMAIN,firebasedynamiclinks-ipv4.googleapis.com",
    "DOMAIN,firebasedynamiclinks-ipv6.googleapis.com",
    "DOMAIN,firebasedynamiclinks.googleapis.com",
    "DOMAIN,firebaseinappmessaging.googleapis.com",
    "DOMAIN,firebaseinstallations.googleapis.com",
    "DOMAIN,firebaselogging-pa.googleapis.com",
    "DOMAIN,firebaselogging.googleapis.com",
    "DOMAIN,firebaseperusertopics-pa.googleapis.com",
    "DOMAIN,firebaseremoteconfig.googleapis.com",
    "DOMAIN,scholar.google.ae",
    "DOMAIN,scholar.google.at",
    "DOMAIN,scholar.google.be",
    "DOMAIN,scholar.google.bg",
    "DOMAIN,scholar.google.ca",
    "DOMAIN,scholar.google.cat",
    "DOMAIN,scholar.google.ch",
    "DOMAIN,scholar.google.cl",
    "DOMAIN,scholar.google.cn",
    "DOMAIN,scholar.google.co.cr",
    "DOMAIN,scholar.google.co.id",
    "DOMAIN,scholar.google.co.il",
    "DOMAIN,scholar.google.co.in",
    "DOMAIN,scholar.google.co.jp",
    "DOMAIN,scholar.google.co.kr",
    "DOMAIN,scholar.google.co.nz",
    "DOMAIN,scholar.google.co.th",
    "DOMAIN,scholar.google.co.uk",
    "DOMAIN,scholar.google.co.ve",
    "DOMAIN,scholar.google.co.za",
    "DOMAIN,scholar.google.com",
    "DOMAIN,scholar.google.com.ar",
    "DOMAIN,scholar.google.com.au",
    "DOMAIN,scholar.google.com.bo",
    "DOMAIN,scholar.google.com.br",
    "DOMAIN,scholar.google.com.co",
    "DOMAIN,scholar.google.com.cu",
    "DOMAIN,scholar.google.com.do",
    "DOMAIN,scholar.google.com.ec",
    "DOMAIN,scholar.google.com.eg",
    "DOMAIN,scholar.google.com.gt",
    "DOMAIN,scholar.google.com.hk",
    "DOMAIN,scholar.google.com.ly",
    "DOMAIN,scholar.google.com.mx",
    "DOMAIN,scholar.google.com.my",
    "DOMAIN,scholar.google.com.ni",
    "DOMAIN,scholar.google.com.pa",
    "DOMAIN,scholar.google.com.pe",
    "DOMAIN,scholar.google.com.ph",
    "DOMAIN,scholar.google.com.pk",
    "DOMAIN,scholar.google.com.pr",
    "DOMAIN,scholar.google.com.py",
    "DOMAIN,scholar.google.com.sg",
    "DOMAIN,scholar.google.com.sv",
    "DOMAIN,scholar.google.com.tr",
    "DOMAIN,scholar.google.com.tw",
    "DOMAIN,scholar.google.com.ua",
    "DOMAIN,scholar.google.com.uy",
    "DOMAIN,scholar.google.com.vn",
    "DOMAIN,scholar.google.cz",
    "DOMAIN,scholar.google.de",
    "DOMAIN,scholar.google.dk",
    "DOMAIN,scholar.google.es",
    "DOMAIN,scholar.google.fi",
    "DOMAIN,scholar.google.fr",
    "DOMAIN,scholar.google.gr",
    "DOMAIN,scholar.google.hn",
    "DOMAIN,scholar.google.hr",
    "DOMAIN,scholar.google.hu",
    "DOMAIN,scholar.google.is",
    "DOMAIN,scholar.google.it",
    "DOMAIN,scholar.google.li",
    "DOMAIN,scholar.google.lt",
    "DOMAIN,scholar.google.lu",
    "DOMAIN,scholar.google.lv",
    "DOMAIN,scholar.google.nl",
    "DOMAIN,scholar.google.no",
    "DOMAIN,scholar.google.pl",
    "DOMAIN,scholar.google.pt",
    "DOMAIN,scholar.google.ro",
    "DOMAIN,scholar.google.ru",
    "DOMAIN,scholar.google.se",
    "DOMAIN,scholar.google.si",
    "DOMAIN,scholar.google.sk",
    "DOMAIN,scholar.googleusercontent.com",
    "DOMAIN,scholar.l.google.com",
    "DOMAIN,publicca.googleapis.com",
    "DOMAIN,preprod-publicca.googleapis.com",
    "DOMAIN,clients1.google.com",
    "DOMAIN,pki.google.com",
    "DOMAIN,android.googlesource.com",
    "DOMAIN,alt7-mtalk.google.com",
    "DOMAIN,alt8-mtalk.google.com",
    "DOMAIN,mtalk-dev.google.com",
    "DOMAIN,mtalk-staging.google.com",
    "DOMAIN,mtalk4.google.com",
    "DOMAIN-SUFFIX,google.com",
    "DOMAIN-SUFFIX,blogger.com",
    "DOMAIN-SUFFIX,blogspot.com",
    "DOMAIN-SUFFIX,android.com",
    "DOMAIN-SUFFIX,fitbit.com",
    "DOMAIN-SUFFIX,gmail.com",
    "DOMAIN-SUFFIX,googleapis.cn",
    "DOMAIN-SUFFIX,googleapis.com",
    "DOMAIN-SUFFIX,googleusercontent.com",
    "DOMAIN-SUFFIX,googlezip.net",
    "DOMAIN-SUFFIX,gstatic.com",
    "DOMAIN-SUFFIX,gvt1.com",
    "DOMAIN-SUFFIX,gvt2.com",
    "DOMAIN-SUFFIX,gvt3.com",
    "DOMAIN-SUFFIX,nest.com",
    "DOMAIN-SUFFIX,waze.com",
    "DOMAIN-SUFFIX,withgoogle.com",
    "DOMAIN-SUFFIX,googleplay.com",
    "DOMAIN-SUFFIX,xn--ngstr-lra8j.com",
    "DOMAIN-SUFFIX,google.com.tw",
    "DOMAIN-SUFFIX,google.com.sg",
    "DOMAIN-SUFFIX,google.com.hk",
    "DOMAIN-SUFFIX,google.co.uk",
    "DOMAIN-SUFFIX,google.co.jp",
    "DOMAIN-SUFFIX,doubleclick.net",
    "DOMAIN-SUFFIX,google-analytics.com",
    "DOMAIN-SUFFIX,googleadservices.com",
    "DOMAIN-SUFFIX,googlesyndication.com",
    "DOMAIN-SUFFIX,googletagmanager.com",
    "DOMAIN,analytics.google.com",
    "DOMAIN,recaptcha-cn.net",
    "DOMAIN,recaptcha.net",
    "DOMAIN,www.recaptcha-cn.net",
    "DOMAIN,www.recaptcha.net",
    "DOMAIN,2mdn-cn.net",
    "DOMAIN,2mdn.net",
    "DOMAIN,admob-cn.com",
    "DOMAIN,adservice.google.com",
    "DOMAIN,app-analytics-services.com",
    "DOMAIN,app-measurement-cn.com",
    "DOMAIN,app-measurement.com",
    "DOMAIN,apps5.oingo.com",
    "DOMAIN,avail.googleflights.net",
    "DOMAIN,beacons.gcp.gvt2.com",
    "DOMAIN,beacons.gvt2.com",
    "DOMAIN,beacons2.gvt2.com",
    "DOMAIN,beacons3.gvt2.com",
    "DOMAIN,c.admob.com",
    "DOMAIN,c.android.clients.google.com",
    "DOMAIN,cache-management-prod.google.com",
    "DOMAIN,cache.pack.google.com",
    "DOMAIN,checkin.gstatic.com",
    "DOMAIN,clickserve.cc-dt.com",
    "DOMAIN,clickserve.dartsearch.net",
    "DOMAIN,clickserver.googleads.com",
    "DOMAIN,clientservices.googleapis.com",
    "DOMAIN,cn.widevine.com",
    "DOMAIN,connectivitycheck.gstatic.com",
    "DOMAIN,csi.gstatic.com",
    "DOMAIN,dartsearch-cn.net",
    "DOMAIN,dg-meta.video.google.com",
    "DOMAIN,dl.google.com",
    "DOMAIN,dl.l.google.com",
    "DOMAIN,doubleclick-cn.net",
    "DOMAIN,doubleclick.net",
    "DOMAIN,download.mlcc.google.com",
    "DOMAIN,download.tensorflow.google.com",
    "DOMAIN,fontfiles.googleapis.com",
    "DOMAIN,fonts.googleapis.com",
    "DOMAIN,fonts.gstatic.com",
    "DOMAIN,g0.gstatic.com",
    "DOMAIN,g1.gstatic.com",
    "DOMAIN,g2.gstatic.com",
    "DOMAIN,g3.gstatic.com",
    "DOMAIN,gonglchuangl.net",
    "DOMAIN,gongyichuangyi.net",
    "DOMAIN,google-analytics-cn.com",
    "DOMAIN,google-analytics.com",
    "DOMAIN,googleadservices-cn.com",
    "DOMAIN,googleadservices.com",
    "DOMAIN,googleanalytics.com",
    "DOMAIN,googleapis-cn.com",
    "DOMAIN,googleapps-cn.com",
    "DOMAIN,googleflights-cn.net",
    "DOMAIN,googleoptimize-cn.com",
    "DOMAIN,googleoptimize.com",
    "DOMAIN,googlesyndication-cn.com",
    "DOMAIN,googlesyndication.com",
    "DOMAIN,googletagmanager-cn.com",
    "DOMAIN,googletagmanager.com",
    "DOMAIN,googletagservices-cn.com",
    "DOMAIN,googletagservices.com",
    "DOMAIN,googletraveladservices-cn.com",
    "DOMAIN,googletraveladservices.com",
    "DOMAIN,googlevads-cn.com",
    "DOMAIN,gstatic-cn.com",
    "DOMAIN,gstaticadssl.l.google.com",
    "DOMAIN,gtm.oasisfeng.com",
    "DOMAIN,imasdk.googleapis.com",
    "DOMAIN,pagead-googlehosted.l.google.com",
    "DOMAIN,performanceparameters.googleapis.com",
    "DOMAIN,prod-controlbe.floonet.goog",
    "DOMAIN,prod-databe.floonet.goog",
    "DOMAIN,prod.databe.floonet.goog",
    "DOMAIN,qiao-cn.com",
    "DOMAIN,qpx.googleflights.net",
    "DOMAIN,redirector.bdn.dev",
    "DOMAIN,redirector.c.chat.google.com",
    "DOMAIN,redirector.c.mail.google.com",
    "DOMAIN,redirector.c.pack.google.com",
    "DOMAIN,redirector.c.youtubeeducation.com",
    "DOMAIN,redirector.gcpcdn.gvt1.com",
    "DOMAIN,redirector.gvt1.com",
    "DOMAIN,redirector.offline-maps.gvt1.com",
    "DOMAIN,redirector.snap.gvt1.com",
    "DOMAIN,redirector.xn--ngstr-lra8j.com",
    "DOMAIN,safebrowsing-cache.google.com",
    "DOMAIN,safebrowsing.googleapis.com",
    "DOMAIN,service.urchin.com",
    "DOMAIN,ssl-google-analytics.l.google.com",
    "DOMAIN,ssl.gstatic.com",
    "DOMAIN,staging-controlbe.floonet.goog",
    "DOMAIN,staging-databe.floonet.goog",
    "DOMAIN,staging.databe.floonet.goog",
    "DOMAIN,tac.googleapis.com",
    "DOMAIN,tools.google.com",
    "DOMAIN,update.googleapis.com",
    "DOMAIN,wear.googleapis.com",
    "DOMAIN,www-google-analytics.l.google.com",
    "DOMAIN,www-googletagmanager.l.google.com",
    "DOMAIN,www.destinationurl.com",
    "DOMAIN,www.gstatic.com",
    "DOMAIN,www.pxcc.com",
    "DOMAIN,crashlyticsreports-pa.googleapis.com",
    "DOMAIN,firebase-settings.crashlytics.com",
    "DOMAIN,update.crashlytics.com",
    "DOMAIN-REGEX,^r+[0-9]+(---|\\.)sn-(2x3|ni5|j5o)\\w{5}\\.xn--ngstr-lra8j\\.com$",
    "DOMAIN-REGEX,^r+[0-9]+(---|\\.)sn-(2x3|ni5|j5o)\\w{5}\\.googlevideo\\.com$",
    "DOMAIN,redirector.c.play.google.com",
    "DOMAIN,pki-goog.l.google.com",
    "DOMAIN,c.pki.goog",
    "DOMAIN,i.pki.goog",
    "DOMAIN,o.pki.goog",
    "DOMAIN,crl.pki.goog",
    "DOMAIN,crls.pki.goog",
    "DOMAIN,ocsp.pki.goog",
    "DOMAIN,alt1-mtalk.google.com",
    "DOMAIN,alt2-mtalk.google.com",
    "DOMAIN,alt3-mtalk.google.com",
    "DOMAIN,alt4-mtalk.google.com",
    "DOMAIN,alt5-mtalk.google.com",
    "DOMAIN,alt6-mtalk.google.com",
    "DOMAIN,mtalk.google.com"
  ],
  "微软生态": [
    "DOMAIN,img-prod-cms-rt-microsoft-com.akamaized.net",
    "DOMAIN,img-s-msn-com.akamaized.net",
    "DOMAIN,mwf-service.akamaized.net",
    "DOMAIN,officecdn-microsoft-com.akamaized.net",
    "DOMAIN,statics-marketingsites-eas-ms-com.akamaized.net",
    "DOMAIN,statics-marketingsites-eus-ms-com.akamaized.net",
    "DOMAIN,statics-marketingsites-wcus-ms-com.akamaized.net",
    "DOMAIN,copilot-proxy.githubusercontent.com",
    "DOMAIN,copilot-workspace.githubnext.com",
    "DOMAIN,az764295.vo.msecnd.net",
    "DOMAIN,bingsettingssearch.trafficmanager.net",
    "DOMAIN,default.exp-tas.com",
    "DOMAIN,developer.microsoft.com",
    "DOMAIN,dtlgalleryint.cloudapp.net",
    "DOMAIN,packages.microsoft.com",
    "DOMAIN,poshtestgallery.cloudapp.net",
    "DOMAIN,psg-int-centralus.cloudapp.net",
    "DOMAIN,psg-int-eastus.cloudapp.net",
    "DOMAIN,rink.hockeyapp.net",
    "DOMAIN,vscode-sync-insiders.trafficmanager.net",
    "DOMAIN,vscode-sync.trafficmanager.net",
    "DOMAIN,vscode.search.windows.net",
    "DOMAIN,vsmarketplacebadge.apphb.com",
    "DOMAIN,crl.microsoft.com",
    "DOMAIN,mscrl.microsoft.com",
    "DOMAIN,ocsp.microsoft.com",
    "DOMAIN,oneocsp.microsoft.com",
    "DOMAIN,www.microsoft.com",
    "DOMAIN,azure.microsoft.com",
    "DOMAIN,azuremarketplace.microsoft.com",
    "DOMAIN,location.microsoft.com",
    "DOMAIN-SUFFIX,microsoft.com",
    "DOMAIN-SUFFIX,github.com",
    "DOMAIN-SUFFIX,aka.ms",
    "DOMAIN-SUFFIX,live.com",
    "DOMAIN-SUFFIX,microsoftonline.com",
    "DOMAIN-SUFFIX,microsoftstore.com",
    "DOMAIN-SUFFIX,msftconnecttest.com",
    "DOMAIN-SUFFIX,msftncsi.com",
    "DOMAIN-SUFFIX,office.com",
    "DOMAIN-SUFFIX,office.net",
    "DOMAIN-SUFFIX,office365.com",
    "DOMAIN-SUFFIX,sharepoint.com",
    "DOMAIN-SUFFIX,skype.com",
    "DOMAIN-SUFFIX,windows.com",
    "DOMAIN-SUFFIX,windowsupdate.com",
    "DOMAIN-SUFFIX,githubassets.com",
    "DOMAIN-SUFFIX,githubusercontent.com",
    "DOMAIN-SUFFIX,githubcopilot.com",
    "DOMAIN-SUFFIX,msn.com",
    "DOMAIN-SUFFIX,onedrive.com",
    "DOMAIN-SUFFIX,xbox.com",
    "DOMAIN-SUFFIX,xboxlive.com",
    "DOMAIN-SUFFIX,bing.com",
    "DOMAIN,azuremigrate.download.prss.microsoft.com",
    "DOMAIN,azuremigratetest.download.prss.microsoft.com",
    "DOMAIN,azurestackhub.download.prss.microsoft.com",
    "DOMAIN,azurestackhubuat.download.prss.microsoft.com",
    "DOMAIN,b.c2r.ts.cdn.office.net",
    "DOMAIN,cbdstest.download.prss.microsoft.com",
    "DOMAIN,cn.windowssearch.com",
    "DOMAIN,collaborate.download.prss.microsoft.com",
    "DOMAIN,collaborateppe.download.prss.microsoft.com",
    "DOMAIN,ctldl.windowsupdate.com",
    "DOMAIN,download.microsoft.com",
    "DOMAIN,dreamspark.download.prss.microsoft.com",
    "DOMAIN,dreamsparkuat.download.prss.microsoft.com",
    "DOMAIN,f.c2r.ts.cdn.office.net",
    "DOMAIN,itacademy.download.prss.microsoft.com",
    "DOMAIN,itacademyuat.download.prss.microsoft.com",
    "DOMAIN,lex.download.prss.microsoft.com",
    "DOMAIN,lexuat.download.prss.microsoft.com",
    "DOMAIN,mbs.download.prss.microsoft.com",
    "DOMAIN,mpnbenefits.download.prss.microsoft.com",
    "DOMAIN,mpnbenefitsrtl.download.prss.microsoft.com",
    "DOMAIN,mpnbenefitsrtluat.download.prss.microsoft.com",
    "DOMAIN,msdn.download.prss.microsoft.com",
    "DOMAIN,msdprod-ad.download.prss.microsoft.com",
    "DOMAIN,msproduct.download.prss.microsoft.com",
    "DOMAIN,myvs.download.prss.microsoft.com",
    "DOMAIN,oemsoc.download.prss.microsoft.com",
    "DOMAIN,oemsocuat.download.prss.microsoft.com",
    "DOMAIN,officecdn.microsoft.com",
    "DOMAIN,officemkt.download.prss.microsoft.com",
    "DOMAIN,officemktuat.download.prss.microsoft.com",
    "DOMAIN,osrelease.download.prss.microsoft.com",
    "DOMAIN,rsm.download.prss.microsoft.com",
    "DOMAIN,sdx.microsoft.com",
    "DOMAIN,shell.cdn.office.net",
    "DOMAIN,software.download.prss.microsoft.com",
    "DOMAIN,statics.teams.cdn.office.net",
    "DOMAIN,storecorefulfillment.download.prss.microsoft.com",
    "DOMAIN,storeedge.microsoft.com",
    "DOMAIN,storeedgefd.dsx.mp.microsoft.com",
    "DOMAIN,surface.download.prss.microsoft.com",
    "DOMAIN,surface.downloads.prss.microsoft.com",
    "DOMAIN,vlportal.download.prss.microsoft.com",
    "DOMAIN,volic.download.prss.microsoft.com",
    "DOMAIN,vscode.download.prss.microsoft.com",
    "DOMAIN,vz.download.prss.microsoft.com",
    "DOMAIN,windbg.download.prss.microsoft.com",
    "DOMAIN,copilot-telemetry-service.githubusercontent.com",
    "DOMAIN,copilot-telemetry.githubusercontent.com",
    "DOMAIN,download.visualstudio.microsoft.com",
    "DOMAIN,bj1.api.bing.com",
    "DOMAIN,e122475.dscg.akamaiedge.net",
    "DOMAIN,licdn.cn.cdn20.com",
    "DOMAIN,linkedin.sc.omtrdc.net",
    "DOMAIN-SUFFIX,licdn.com",
    "DOMAIN-SUFFIX,linkedin.com"
  ],
  "公共基础服务": [
    "DOMAIN-SUFFIX,workos.com",
    "DOMAIN-SUFFIX,workoscdn.com",
    "DOMAIN-SUFFIX,stripe.com",
    "DOMAIN-SUFFIX,stripe.network",
    "DOMAIN-SUFFIX,browser-intake-datadoghq.com",
    "DOMAIN-SUFFIX,sentry.io",
    "DOMAIN-SUFFIX,intercom.io",
    "DOMAIN-SUFFIX,intercomcdn.com",
    "DOMAIN-SUFFIX,ct.sendgrid.net",
    "DOMAIN-SUFFIX,auth0.com",
    "DOMAIN-SUFFIX,livekit.cloud",
    "DOMAIN-SUFFIX,cdn.cloudflare.net",
    "DOMAIN-SUFFIX,cloudflare.com",
    "DOMAIN-SUFFIX,webpubsub.azure.com",
    "DOMAIN-SUFFIX,blob.core.windows.net",
    "DOMAIN-SUFFIX,azurewebsites.net",
    "DOMAIN-SUFFIX,azurestaticapps.net",
    "DOMAIN-SUFFIX,azureedge.net",
    "DOMAIN-SUFFIX,azurefd.net",
    "DOMAIN-SUFFIX,appspot.com",
    "DOMAIN-SUFFIX,firebaseio.com",
    "DOMAIN-SUFFIX,firebaseapp.com",
    "DOMAIN-SUFFIX,run.app",
    "DOMAIN-SUFFIX,pages.dev",
    "DOMAIN-SUFFIX,workers.dev",
    "DOMAIN-SUFFIX,r2.dev",
    "DOMAIN-SUFFIX,cloudfront.net",
    "DOMAIN-SUFFIX,amazonaws.com",
    "DOMAIN-SUFFIX,cloudinary.com",
    "DOMAIN-SUFFIX,imgix.net",
    "DOMAIN-SUFFIX,arkoselabs.com",
    "DOMAIN-SUFFIX,usefathom.com",
    "DOMAIN-SUFFIX,sendgrid.net",
    "DOMAIN-SUFFIX,qualtrics.com",
    "DOMAIN-SUFFIX,github.io",
    "DOMAIN-SUFFIX,githubpreview.dev",
    "DOMAIN,challenges.cloudflare.com",
    "DOMAIN,workos.imgix.net",
    "DOMAIN-SUFFIX,cloudapp.net",
    "DOMAIN-SUFFIX,cloudapp.azure.com",
    "DOMAIN-SUFFIX,azure-api.net",
    "DOMAIN-SUFFIX,azurecontainer.io",
    "DOMAIN-SUFFIX,trafficmanager.net",
    "DOMAIN-SUFFIX,azurecr.io",
    "DOMAIN-SUFFIX,cosmos.azure.com",
    "DOMAIN-SUFFIX,documents.azure.com",
    "DOMAIN-SUFFIX,vault.azure.net",
    "DOMAIN-SUFFIX,azmk8s.io",
    "DOMAIN-SUFFIX,servicebus.windows.net",
    "DOMAIN-SUFFIX,database.windows.net",
    "DOMAIN-SUFFIX,file.core.windows.net",
    "DOMAIN-SUFFIX,queue.core.windows.net",
    "DOMAIN-SUFFIX,table.core.windows.net",
    "DOMAIN-SUFFIX,web.core.windows.net",
    "DOMAIN-SUFFIX,dfs.core.windows.net",
    "DOMAIN-SUFFIX,chinacloudapp.cn",
    "DOMAIN-SUFFIX,blob.core.chinacloudapi.cn",
    "DOMAIN-SUFFIX,queue.core.chinacloudapi.cn",
    "DOMAIN-SUFFIX,table.core.chinacloudapi.cn",
    "DOMAIN-SUFFIX,dfs.core.chinacloudapi.cn",
    "DOMAIN-SUFFIX,database.chinacloudapi.cn",
    "DOMAIN-SUFFIX,servicebus.chinacloudapi.cn",
    "DOMAIN-SUFFIX,vault.azure.cn",
    "DOMAIN-SUFFIX,azure-api.cn",
    "DOMAIN-SUFFIX,cloudfunctions.net",
    "DOMAIN-SUFFIX,storage.googleapis.com",
    "DOMAIN-SUFFIX,content-storage.googleapis.com",
    "DOMAIN-SUFFIX,storage.cloud.google.com",
    "DOMAIN-SUFFIX,storage.mtls.googleapis.com",
    "DOMAIN-SUFFIX,storage.mtls.cloud.google.com"
  ]
};

// Display order is independent of V14_SERVICES' routing precedence.
// Unlisted services keep their relative order after these pinned groups.
const V14_PINNED_GROUPS = [
  "高纯净度AI用", "高网速视频用", "自动选择", "公共基础服务", "漏网之鱼", "国内网站",
  "OpenAI 服务", "Anthropic 服务", "谷歌服务", "微软生态",
  "Steam", "Epic Games", "Telegram", "TikTok", "Twitter", "Discord",
];
const V14_GROUP_ORDER = V14_PINNED_GROUPS.concat(
  V14_SERVICES.map(s => s.name).filter(name => !V14_PINNED_GROUPS.includes(name)));

// Telegram official CIDR snapshot, retrieved 2026-09-24 via the web reader.
// Source: https://core.telegram.org/resources/cidr.txt
const V14_TELEGRAM_CIDRS = ["91.108.56.0/22", "91.108.4.0/22", "91.108.8.0/22", "91.108.16.0/22", "91.108.12.0/22", "149.154.160.0/20", "91.105.192.0/23", "91.108.20.0/22", "185.76.151.0/24", "2001:b28:f23d::/48", "2001:b28:f23f::/48", "2001:67c:4e8::/48", "2001:b28:f23c::/48", "2a0a:f280::/32"];

function v14Fail(message) { throw new Error("V14: " + message); }
function v14Object(x) { return x !== null && typeof x === "object" && !Array.isArray(x); }
function v14Copy(x) { return JSON.parse(JSON.stringify(x)); }
function v14Unique(xs) { return Array.from(new Set(xs)); }
function v14Hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16);
}
function v14Ipv6Literal(s) {
  if (typeof s !== "string") return false;
  return /^[0-9a-fA-F:.%]+$/.test(s.replace(/^\[/, "").replace(/\]$/, "")) && s.includes(":");
}
function v14Transport(p) { return !V14_NOT_NODES.has(String(p.type || "").toLowerCase()); }
function v14DnsFor(group) { return V14.groupDnsUrls.map(url => url + "#" + group + "&disable-reuse=true"); }

// Shared V14 candidate validation. No network I/O and no node wrappers.
function v14Strings(xs, owner) {
  if (xs == null) return [];
  if (!Array.isArray(xs) || xs.some(x => typeof x !== "string")) v14Fail(owner + " 必须是字符串数组。");
  return xs;
}
function v14Target(rule) {
  if (typeof rule !== "string" || !rule.trim()) v14Fail("存在空的或非字符串规则。");
  const fields = rule.split(",");
  return fields[fields.length - (fields[fields.length - 1] === "no-resolve" ? 2 : 1)].trim();
}
function v14InboundGuard(config) {
  // A retained inbound with its own policy skips the company/DNS/UDP rules.
  // Reject incompatible inputs before returning any generated configuration.
  if (config.listeners != null && !Array.isArray(config.listeners)) v14Fail("listeners 必须是数组。");
  for (const l of (config.listeners || [])) {
    if (!v14Object(l)) v14Fail("存在无效 listener。");
    if (l.proxy || l.rule || String(l.type || "").toLowerCase() === "tun")
      v14Fail("自定义入站会绕过主规则：listener " + (l.name || "未命名") + "；移除 proxy/rule，独立 TUN 入站需单独审核，不能继承旁路。");
  }
  if (config.tunnels != null && !Array.isArray(config.tunnels)) v14Fail("tunnels 必须是数组。");
  for (const [i, tunnel] of (config.tunnels || []).entries()) {
    if ((v14Object(tunnel) && tunnel.proxy) ||
        (typeof tunnel === "string" && tunnel.split(",").length === 4 && tunnel.split(",")[3].trim()))
      v14Fail("自定义入站会绕过主规则：tunnels[" + i + "] 的固定出口需移除或单独审核。");
  }
}

function v14KeepLegacy(config, retain, android) {
  // Preserve the dependency closure of non-generated sub-rules and custom
  // inbounds. Never preserve an object while discarding its dependencies.
  const subs = config["sub-rules"] == null ? {} : config["sub-rules"];
  const oldSets = config["rule-providers"] == null ? {} : config["rule-providers"];
  if (!v14Object(subs) || !v14Object(oldSets)) v14Fail("sub-rules/rule-providers 必须是对象。");
  const keptSets = {}, subState = new Map(), setState = new Map();
  function geoCheck(text, owner) {
    if (android && /(?:^|[,(])\s*(?:GEOSITE|GEOIP),/i.test(text))
      v14Fail(owner + " 含 GeoSite/GeoIP；Android 无 Geo 数据合同不允许静默继承它。");
  }
  function setRef(name, owner) {
    if (setState.get(name) === 1) v14Fail("rule-provider 引用成环：" + owner + " -> " + name);
    if (setState.get(name) === 2) return;
    const set = oldSets[name];
    if (!v14Object(set)) v14Fail(owner + " 引用不存在的 rule-provider：" + name);
    if (!["inline", "http", "file"].includes(set.type)) v14Fail("未知 rule-provider 类型：" + name);
    if (!["domain", "ipcidr", "classical"].includes(set.behavior)) v14Fail("未知 rule-provider behavior：" + name);
    if (android && set.behavior === "classical" && set.type !== "inline")
      v14Fail("Android 无法静态排除外部 classical rule-provider 中的 Geo 依赖：" + name);
    setState.set(name, 1); keptSets[name] = v14Copy(set);
    // Our previous generated download selector is rebuilt later in main().
    if (!v14ManagedSource(name, set)) retain(set.proxy, "rule-provider " + name);
    if (set.type === "inline") {
      for (const item of v14Strings(set.payload, "rule-provider " + name + ".payload")) {
        if (set.behavior !== "classical") continue;
        geoCheck(item, "rule-provider " + name);
        for (const m of item.matchAll(/(?:^|[,(])\s*RULE-SET,([^,)]+)/g)) setRef(m[1].trim(), name);
      }
    }
    setState.set(name, 2);
  }
  function subRef(name, owner) {
    if (subState.get(name) === 1) v14Fail("sub-rule 引用成环：" + owner + " -> " + name);
    if (subState.get(name) === 2) return;
    if (!Object.prototype.hasOwnProperty.call(subs, name)) v14Fail(owner + " 引用不存在的 sub-rule：" + name);
    subState.set(name, 1);
    for (const rule of v14Strings(subs[name], "sub-rule " + name)) {
      geoCheck(rule, "sub-rule " + name);
      for (const m of rule.matchAll(/(?:^|[,(])\s*RULE-SET,([^,)]+)/g)) setRef(m[1].trim(), name);
      if (rule.startsWith("SUB-RULE,")) subRef(v14Target(rule), name);
      else retain(v14Target(rule), "sub-rule " + name);
    }
    subState.set(name, 2);
  }
  for (const name of Object.keys(subs)) subRef(name, "sub-rules");
  if (config.listeners != null && !Array.isArray(config.listeners)) v14Fail("listeners 必须是数组。");
  for (const l of (config.listeners || [])) {
    if (!v14Object(l)) v14Fail("存在无效 listener。");
    retain(l.proxy, "listener " + l.name + ".proxy");
    if (l.rule) subRef(l.rule, "listener " + l.name + ".rule");
  }
  if (config.tunnels != null && !Array.isArray(config.tunnels)) v14Fail("tunnels 必须是数组。");
  for (const [i, t] of (config.tunnels || []).entries()) {
    if (v14Object(t)) retain(t.proxy, "tunnels[" + i + "].proxy");
    else if (typeof t === "string") {
      const fields = t.split(",");
      if (fields.length !== 3 && fields.length !== 4) v14Fail("tunnels[" + i + "] 格式不支持。");
      if (fields.length === 4) retain(fields[3].trim(), "tunnels[" + i + "]");
    } else v14Fail("tunnels[" + i + "] 必须是字符串或对象。");
  }
  for (const p of (config.proxies || [])) if (p.type === "rematch") subRef(p["target-sub-rule"], p.name);
  for (const [name, owner] of v14AuxRefs(config)) setRef(name, owner);
  return keptSets;
}
// Address-family defaults affect the connection to a node, not its remote exit.
const V14_NODE_FAMILY_DEFAULT = '(select(.["ip-version"] == null and ((.server // "") | contains(":")) == false and ((.server // "") | test("^[0-9.]+$")) == false) | .["ip-version"]) = "ipv4-prefer"';
function v14NetworkDefaults(config) {
  for (const node of config.proxies || []) {
    if (v14Transport(node) && node["ip-version"] == null && typeof node.server === "string" &&
        node.server && !node.server.includes(":") && !/^[0-9.]+$/.test(node.server)) node["ip-version"] = "ipv4-prefer";
  }
  for (const provider of Object.values(config["proxy-providers"] || {})) {
    const override = provider.override;
    const expressions = (override["override-expr"] || []).filter(x => x !== V14_NODE_FAMILY_DEFAULT);
    // A user expression which removes or assigns the field is an explicit choice.
    if (!expressions.some(x => /ip-version/i.test(x))) expressions.push(V14_NODE_FAMILY_DEFAULT);
    if (expressions.length) override["override-expr"] = expressions;
    else delete override["override-expr"];
  }
  const marker = config["x-v14-generated"];
  marker.networkCompatibilityRevision = "ipv6-fallback-r1";
  marker.networkMode = "dual-stack";
  marker.nodeAddressFamilyDefault = "ipv4-prefer-unless-explicit-domain-nodes-only";
  return config;
}

function v14ProviderGuard(provider, name, retain, warnings, upgradingFromV13) {
  // V13 appended two commands to every provider. Remove that exact suffix on
  // upgrade; never erase user-defined custom expressions or dialer references.
  const formerBlock6 = '(select((.server // "") | contains(":")) | .type) = "reject"';
  const formerForce4 = '.["ip-version"] = "ipv4"';
  const o = provider.override;
  // Provider exclude-type acts on raw mappings, before override-expr.
  // Hide and reject a mapping that a custom expression turns into a bypass.
  const guardName = '(select(.type == "direct" or .type == "compatible" or .type == "pass" or .type == "pass-rule" or .type == "dns" or .type == "rematch" or .type == "reject" or .type == "reject-drop" or .type == "reject-no-drop") | .name) = "@v14-nontransport:" + .name';
  const guardType = '(select((.name // "") | contains("@v14-nontransport:")) | .type) = "reject"';
  const expressions = v14Strings(o["override-expr"], "provider " + name + ".override.override-expr").filter(e => e !== guardName && e !== guardType && e !== V14_NODE_FAMILY_DEFAULT);
  if (upgradingFromV13 && expressions.length >= 2 &&
      expressions[expressions.length - 2] === formerBlock6 &&
      expressions[expressions.length - 1] === formerForce4) expressions.splice(-2);
  for (const expr of expressions) {
    if (/dialer-proxy/i.test(expr))
      v14Fail("provider " + name + " 的 override-expr 动态修改 dialer-proxy；请使用可检查的 override.dialer-proxy。");
  }
  if (expressions.length) o["override-expr"] = expressions.concat(guardName, guardType);
  else delete o["override-expr"];
  const names = new Set();
  for (const p of (provider.payload || [])) {
    if (!v14Object(p) || typeof p.name !== "string" || !p.name || !p.type)
      v14Fail("provider " + name + " 含无效 payload 节点。");
    if (names.has(p.name)) v14Fail("provider " + name + " 的 payload 节点重名：" + p.name);
    names.add(p.name);
    retain(o["dialer-proxy"] || p["dialer-proxy"], "provider " + name + " payload " + p.name);
    if (upgradingFromV13 && v14Transport(p) && p["ip-version"] === "ipv4")
      delete p["ip-version"];
  }
  if (expressions.length)
    warnings.push("provider " + name + " 保留自定义表达式；动态更新后的成员需在内核复核。");
}
function v14GraphCheck(config, warnings) {
  const groups = new Map(config["proxy-groups"].map(g => [g.name, g]));
  const nodes = new Map(config.proxies.map(p => [p.name, p]));
  const providers = config["proxy-providers"] || {};
  const edges = new Map(), state = new Map();
  const providerId = n => "\u0000provider:" + n;
  // Only use the portable regexp subset for supplementary static checks.
  // Native fields remain untouched. Nonportable patterns are explicitly
  // recorded as unverified, not approximated as a successful runtime check.
  function match(pattern, text, owner) {
    if (!pattern) return true;
    if (typeof pattern !== "string") v14Fail(owner + " 正则必须是字符串。");
    let src = pattern, flags = "";
    const prefix = /^\(\?([ims]+)\)/.exec(src);
    if (prefix) { flags = prefix[1]; src = src.slice(prefix[0].length); }
    if (src.includes("(?") || /\\[pPkK]|\\[1-9]|\[[^\]]*&&/.test(src)) {
      warnings.push(owner + " 使用非便携正则；原生过滤保持，额外静态动态成员检查未覆盖。");
      return null;
    }
    try { return new RegExp(src, flags).test(text); }
    catch (_) { warnings.push(owner + " 的正则交由 Mihomo 检查；脚本没有改写其语义。"); return null; }
  }
  const enumTypes = { ss: "Shadowsocks", ssr: "ShadowsocksR", socks5: "Socks5", http: "Http", vmess: "Vmess", vless: "Vless", tuic: "Tuic", hysteria: "Hysteria", hysteria2: "Hysteria2", "reject-no-drop": "RejectNoDrop", "reject-drop": "RejectDrop", "pass-rule": "PassRule" };
  function excluded(g, p) {
    if (g["exclude-filter"]) {
      const x = match(g["exclude-filter"], p.name, g.name + ".exclude-filter");
      if (x === true) return true;
      if (x === null) return null;
    }
    const typ = (enumTypes[p.type] || p.type || "").toLowerCase();
    return String(g["exclude-type"] || "").toLowerCase().split("|").includes(typ);
  }
  for (const [name, p] of nodes) edges.set(name, p["dialer-proxy"] ? [p["dialer-proxy"]] : []);
  for (const [name, g] of groups) {
    const refs = [];
    for (const r of v14Strings(g.proxies, g.name + ".proxies")) {
      if (excluded(g, nodes.get(r) || { name: r, type: "" }) === false) refs.push(r);
    }
    if (g["include-all"] || g["include-all-proxies"]) {
      for (const p of nodes.values())
        if (match(g.filter, p.name, name + ".filter") === true && excluded(g, p) === false) refs.push(p.name);
    }
    const sources = g["include-all"] || g["include-all-providers"] ? Object.keys(providers) : v14Strings(g.use, name + ".use");
    for (const source of sources) {
      if (!providers[source]) v14Fail(name + " 引用未知 provider：" + source);
      refs.push(providerId(source));
      const pd = providers[source], o = pd.override || {};
      const customExprs = (o["override-expr"] || []).slice();
      const transformsNames = o["additional-prefix"] || o["additional-suffix"] || o["proxy-name"];
      if (pd.type !== "inline" || customExprs.length || transformsNames) {
        if (o["dialer-proxy"] || (pd.payload || []).some(p => p["dialer-proxy"]))
          warnings.push("provider " + source + " 的动态/改名后链式成员需内核检查；未把未经证实的循环候选当作确定错误。");
        continue;
      }
      for (const [index, raw] of (pd.payload || []).entries()) {
        // With no custom expressions or name transforms, provider/group name
        // filters can be checked without approximating the effective names.
        if (match(pd.filter, raw.name, source + ".filter") !== true) continue;
        if (pd["exclude-filter"] && match(pd["exclude-filter"], raw.name, source + ".exclude-filter") !== false) continue;
        if (String(pd["exclude-type"] || "").toLowerCase().split("|").includes(String(raw.type).toLowerCase())) continue;
        const effective = Object.assign({}, raw);
        if (match(g.filter, effective.name, name + ".filter") !== true || excluded(g, effective) !== false) continue;
        const id = providerId(source) + ":node:" + index;
        const dialer = o["dialer-proxy"] || raw["dialer-proxy"];
        edges.set(id, dialer ? [dialer] : []);
        refs.push(id);
      }
    }
    if (g["empty-fallback"]) {
      if (groups.has(g["empty-fallback"])) v14Fail(name + ".empty-fallback 只能引用代理节点或内置策略，不能引用组。");
      refs.push(g["empty-fallback"]);
    }
    edges.set(name, v14Unique(refs));
  }
  // A provider marker records membership for bootstrap-cycle detection.
  // Concrete inline node edges above respect each referencing group's filter.
  // Do not conflate all provider payload nodes into every filtered group.
  for (const name of Object.keys(providers)) edges.set(providerId(name), []);
  function walk(n, path) {
    if (V14_BUILTINS.has(n)) return;
    if (!edges.has(n)) v14Fail("依赖图含未知引用：" + path.concat(n).join(" -> "));
    if (state.get(n) === 1) v14Fail("节点/组/provider 链路成环：" + path.concat(n).join(" -> "));
    if (state.get(n) === 2) return;
    state.set(n, 1);
    for (const child of edges.get(n)) walk(child, path.concat(n));
    state.set(n, 2);
  }
  for (const n of edges.keys()) walk(n, []);
  function reaches(ref, target, seen) {
    if (ref === target) return true;
    if (seen.has(ref)) return false;
    seen.add(ref);
    return (edges.get(ref) || []).some(r => reaches(r, target, seen));
  }
  for (const [name, p] of Object.entries(providers))
    if (p.type === "http" && reaches(p.proxy, providerId(name), new Set()))
      v14Fail("provider 冷启动依赖自身：" + name + " -> " + p.proxy);
  function dialable(ref, owner, seen) {
    if (!ref || V14_BUILTINS.has(ref) || seen.has(ref)) return;
    seen.add(ref);
    const p = nodes.get(ref);
    if (p && p.type === "rematch") v14Fail(owner + " 不可直接拨号 rematch：" + ref);
    for (const child of (edges.get(ref) || [])) dialable(child, owner, seen);
  }
  for (const p of nodes.values()) dialable(p["dialer-proxy"], p.name + ".dialer-proxy", new Set());
  for (const [name, p] of Object.entries(providers)) dialable(p.proxy, "provider " + name + ".proxy", new Set());
  for (const [name, p] of Object.entries(config["rule-providers"] || {})) dialable(p.proxy, "rule-provider " + name + ".proxy", new Set());
}

// V14 Android managed rule sources (shared V14 data format). This is a compiler, not a runtime network client.
// Full classical domain sets preserve DOMAIN-REGEX/DOMAIN-KEYWORD. The large
// CN domain set (domain/full entries in the checked upstream) and IP sets use MRS.
// No generated matcher needs a local GEOSITE.dat/GEOIP.dat/Country.mmdb file.
const V14_RULE_ROOT = "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/";
// DIRECT boundaries change only with an explicitly reviewed release.
const V14_DIRECT_RULE_PINS = {
  "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/classical/private.yaml": "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/b4d414227a182c5bc954283e4a83ee176dad671b/geo/geosite/classical/private.yaml",
  "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/classical/category-doh.yaml": "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/b4d414227a182c5bc954283e4a83ee176dad671b/geo/geosite/classical/category-doh.yaml",
  "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/classical/douyin.yaml": "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/b4d414227a182c5bc954283e4a83ee176dad671b/geo/geosite/classical/douyin.yaml",
  "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/classical/apple@cn.yaml": "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/b4d414227a182c5bc954283e4a83ee176dad671b/geo/geosite/classical/apple@cn.yaml",
  "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/classical/google@cn.yaml": "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/b4d414227a182c5bc954283e4a83ee176dad671b/geo/geosite/classical/google@cn.yaml",
  "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/classical/microsoft@cn.yaml": "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/b4d414227a182c5bc954283e4a83ee176dad671b/geo/geosite/classical/microsoft@cn.yaml",
  "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/classical/steam@cn.yaml": "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/b4d414227a182c5bc954283e4a83ee176dad671b/geo/geosite/classical/steam@cn.yaml",
  "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/cn.mrs": "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/b4d414227a182c5bc954283e4a83ee176dad671b/geo/geosite/cn.mrs",
  "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/classical/netflix.yaml": "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/b4d414227a182c5bc954283e4a83ee176dad671b/geo/geosite/classical/netflix.yaml",
  "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/classical/disney.yaml": "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/b4d414227a182c5bc954283e4a83ee176dad671b/geo/geosite/classical/disney.yaml",
  "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/classical/spotify.yaml": "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/b4d414227a182c5bc954283e4a83ee176dad671b/geo/geosite/classical/spotify.yaml",
  "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/classical/telegram.yaml": "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/b4d414227a182c5bc954283e4a83ee176dad671b/geo/geosite/classical/telegram.yaml",
  "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/classical/discord.yaml": "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/b4d414227a182c5bc954283e4a83ee176dad671b/geo/geosite/classical/discord.yaml",
  "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/classical/tiktok.yaml": "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/b4d414227a182c5bc954283e4a83ee176dad671b/geo/geosite/classical/tiktok.yaml",
  "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/classical/twitter.yaml": "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/b4d414227a182c5bc954283e4a83ee176dad671b/geo/geosite/classical/twitter.yaml",
  "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/classical/meta.yaml": "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/b4d414227a182c5bc954283e4a83ee176dad671b/geo/geosite/classical/meta.yaml",
  "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/classical/steam.yaml": "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/b4d414227a182c5bc954283e4a83ee176dad671b/geo/geosite/classical/steam.yaml",
  "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/classical/epicgames.yaml": "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/b4d414227a182c5bc954283e4a83ee176dad671b/geo/geosite/classical/epicgames.yaml",
  "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/classical/apple.yaml": "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/b4d414227a182c5bc954283e4a83ee176dad671b/geo/geosite/classical/apple.yaml",
  "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/classical/bilibili.yaml": "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/b4d414227a182c5bc954283e4a83ee176dad671b/geo/geosite/classical/bilibili.yaml",
  "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geoip/netflix.mrs": "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/b4d414227a182c5bc954283e4a83ee176dad671b/geo/geoip/netflix.mrs",
  "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geoip/telegram.mrs": "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/b4d414227a182c5bc954283e4a83ee176dad671b/geo/geoip/telegram.mrs",
  "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geoip/twitter.mrs": "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/b4d414227a182c5bc954283e4a83ee176dad671b/geo/geoip/twitter.mrs",
  "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geoip/cn.mrs": "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/b4d414227a182c5bc954283e4a83ee176dad671b/geo/geoip/cn.mrs",
  "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/classical/anthropic.yaml": "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/b4d414227a182c5bc954283e4a83ee176dad671b/geo/geosite/classical/anthropic.yaml",
  "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/classical/google-gemini.yaml": "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/b4d414227a182c5bc954283e4a83ee176dad671b/geo/geosite/classical/google-gemini.yaml",
  "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/classical/youtube.yaml": "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/b4d414227a182c5bc954283e4a83ee176dad671b/geo/geosite/classical/youtube.yaml",
  "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/google.mrs": "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/b4d414227a182c5bc954283e4a83ee176dad671b/geo/geosite/google.mrs",
  "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/microsoft.mrs": "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/b4d414227a182c5bc954283e4a83ee176dad671b/geo/geosite/microsoft.mrs",
  "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/classical/linkedin.yaml": "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/b4d414227a182c5bc954283e4a83ee176dad671b/geo/geosite/classical/linkedin.yaml"
};
const V14_DOMAIN_TAGS = new Set(["private", "category-doh", "cn"].concat(
  V14_DOMESTIC_SETS, ...V14_SERVICES.map(s => s.sets)));
const V14_IP_TAGS = new Set(["cn"].concat(...V14_SERVICES.map(s => s.ips || [])));
function v14Source(kind, rawTag, lookupOnly = false) {
  const tag = String(rawTag).trim().toLowerCase();
  if (!(kind === "domain" ? V14_DOMAIN_TAGS : V14_IP_TAGS).has(tag))
    v14Fail("无 Geo 迁移未收录分类 " + kind + ":" + tag + "；请为自定义分类提供显式 domain/ipcidr rule-provider，不会猜测下载地址或静默丢弃规则。");
  const mrs = kind === "ip" || ["cn", "google", "microsoft"].includes(tag);
  const relative = (kind === "ip" ? "geoip/" : "geosite/" + (mrs ? "" : "classical/")) + tag + (mrs ? ".mrs" : ".yaml");
  const url = V14_RULE_ROOT + relative;
  const pinned = V14_DIRECT_RULE_PINS[url];
  if (!pinned && lookupOnly) return null; // Recognition must not create an unreviewed source.
  const prefix = "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/";
  const suffix = "/geo/" + relative;
  const commit = typeof pinned === "string" ? pinned.slice(prefix.length, -suffix.length) : "";
  if (!/^[a-f0-9]{40}$/.test(commit) || pinned !== prefix + commit + suffix)
    v14Fail("规则来源未固定到已审核提交：" + kind + ":" + tag + "；拒绝退回浮动分支，请先审核来源并补齐固定映射。");
  return {kind, tag, url: pinned,
    behavior: kind === "ip" ? "ipcidr" : mrs ? "domain" : "classical", format: mrs ? "mrs" : "yaml"};
}
function v14ManagedSource(name, provider) {
  if (!/^v12r-(?:domain|ip)-/.test(name) || !v14Object(provider) || provider.type !== "http") return null;
  for (const kind of ["domain", "ip"]) for (const tag of (kind === "domain" ? V14_DOMAIN_TAGS : V14_IP_TAGS)) {
    const s = v14Source(kind, tag, true);
    if (s && (provider.url === s.url || V14_DIRECT_RULE_PINS[provider.url] === s.url) && provider.behavior === s.behavior && provider.format === s.format) return s;
  }
  return null;
}
// Auxiliary rule-set dependencies must not disappear when old top-level rules
// are replaced. These fields are native Mihomo matchers / TUN address sets.
function v14AuxRefs(config) {
  const out = [];
  for (const key of ["force-domain", "skip-domain", "skip-src-address", "skip-dst-address"]) {
    for (const value of v14Strings((config.sniffer || {})[key], "sniffer." + key)) {
      if (/^rule-set:/i.test(value)) for (const name of value.slice(9).split(",")) out.push([name.trim(), "sniffer." + key]);
    }
  }
  for (const key of ["route-address-set", "route-exclude-address-set"]) {
    for (const name of v14Strings((config.tun || {})[key], "tun." + key)) out.push([name, "tun." + key]);
  }
  return out;
}
// Parenthesis-aware rule walker. Plain DOMAIN-REGEX payloads are left byte-for-
// byte unchanged; a regex containing the word "GEOSITE" is not a Geo matcher.
function v14WalkRule(text, atom, owner) {
  if (typeof text !== "string" || !text.trim()) v14Fail(owner + " 含无效规则。");
  const lead = /^\s*([A-Za-z0-9-]+)\s*(?:,|$)/.exec(text);
  if (!lead) v14Fail(owner + " 无法识别规则类型：" + text);
  const type = lead[1].toUpperCase();
  if (!["AND", "OR", "NOT", "SUB-RULE"].includes(type)) return atom(type, text, owner);
  const start = text.indexOf("(", lead[0].length);
  if (start < 0 || text.slice(lead[0].length, start).trim()) v14Fail(owner + " 逻辑规则缺少条件括号：" + text);
  function close(s, pos) {
    let depth = 0, escaped = false, bracket = false;
    for (let i = pos; i < s.length; i++) {
      const c = s[i];
      if (escaped) { escaped = false; continue; }
      if (c === "\\") { escaped = true; continue; }
      if (c === "[" && !bracket) { bracket = true; continue; }
      if (c === "]" && bracket) { bracket = false; continue; }
      if (bracket) continue;
      if (c === "(") depth++;
      if (c === ")" && --depth === 0) return i;
    }
    v14Fail(owner + " 逻辑规则括号不平衡；不会近似改写：" + s);
  }
  const end = close(text, start);
  const inside = text.slice(start + 1, end);
  let replaced;
  if (type === "SUB-RULE") replaced = v14WalkRule(inside, atom, owner);
  else {
    const parts = []; let pos = 0;
    while (pos < inside.length) {
      while (/\s/.test(inside[pos] || "") && pos < inside.length) pos++;
      if (inside[pos] !== "(") v14Fail(owner + " 逻辑条件格式不支持：" + text);
      const e = close(inside, pos);
      parts.push("(" + v14WalkRule(inside.slice(pos + 1, e), atom, owner) + ")");
      pos = e + 1;
      while (pos < inside.length && /\s/.test(inside[pos])) pos++;
      if (pos < inside.length) {
        if (inside[pos] !== ",") v14Fail(owner + " 条件分隔符无效：" + text);
        pos++;
      }
    }
    if (!parts.length) v14Fail(owner + " 逻辑条件为空。");
    replaced = parts.join(",");
  }
  return text.slice(0, start + 1) + replaced + text.slice(end);
}
function v14RuleRegistry(config, downloadProxy) {
  const sets = config["rule-providers"];
  const byKey = new Map(), generated = new Map();
  // Only recognize our canonical sources. A user provider with the same name
  // but different content is never overwritten.
  for (const [name, p] of Object.entries(sets)) {
    const s = v14ManagedSource(name, p);
    if (s && !byKey.has(s.kind + ":" + s.tag)) byKey.set(s.kind + ":" + s.tag, name);
  }
  function ref(kind, tag) {
    const s = v14Source(kind, tag), key = s.kind + ":" + s.tag;
    let name = byKey.get(key);
    if (!name) {
      const base = "v12r-" + s.kind + "-" + s.tag.replace(/@/g, "_at_");
      name = base; let i = 1;
      while (Object.prototype.hasOwnProperty.call(sets, name)) name = base + "-" + (++i);
      byKey.set(key, name);
    }
    if (!generated.has(name)) {
      // URL + kind identify the cache, NOT patch version or runtime group name.
      // Naming collisions do not cause two distinct sources to share a file.
      const path = "./ruleset/v12-managed/" + s.kind + "-" + s.tag.replace(/@/g, "_at_") + "-" + v14Hash(s.url) + "." + s.format;
      sets[name] = { type: "http", behavior: s.behavior, format: s.format, url: s.url,
        path, interval: V14.ruleInterval, proxy: downloadProxy, "size-limit": V14.ruleSizeLimit };
      generated.set(name, {...s, name, path, proxy: downloadProxy});
    }
    return name;
  }
  function convertAtom(type, text, owner) {
    if (["SRC-GEOIP", "IP-ASN", "SRC-IP-ASN"].includes(type))
      v14Fail(owner + " 使用 " + type + "；不能保证去除其本地数据库依赖，请改为已核实的显式地址规则。本次不悄悄改变来源/目标语义。");
    if (type !== "GEOSITE" && type !== "GEOIP") return text;
    const m = /^\s*[^,]+,\s*([^,]+)(.*)$/.exec(text);
    if (!m) v14Fail(owner + " Geo 规则格式无效：" + text);
    return "RULE-SET," + ref(type === "GEOSITE" ? "domain" : "ip", m[1]) + m[2];
  }
  function convertValue(value, domain, owner) {
    if (typeof value !== "string") v14Fail(owner + " 必须为字符串。");
    if (/^(?:geosite|geoip):/i.test(value)) {
      const type = value.slice(0, value.indexOf(":" )).toLowerCase();
      if ((type === "geosite") !== domain) v14Fail(owner + " Geo 类型与字段不匹配。");
      const tags = value.slice(value.indexOf(":") + 1).split(",");
      return "rule-set:" + tags.map(t => ref(domain ? "domain" : "ip", t)).join(",");
    }
    return value;
  }
  function assertRef(name, owner, domain) {
    if (!sets[name]) v14Fail(owner + " 缺失 rule-provider：" + name);
    const b = sets[name].behavior;
    if (domain === true && b === "ipcidr") v14Fail(owner + " 不能使用 IP-only 规则集：" + name);
    if (domain === false && b === "domain") v14Fail(owner + " 不能使用 domain-only 规则集：" + name);
  }
  function verifyAtom(type, text, owner) {
    if (["GEOSITE", "GEOIP", "SRC-GEOIP", "IP-ASN", "SRC-IP-ASN"].includes(type)) v14Fail(owner + " 仍有本地 Geo/ASN 数据依赖。");
    if (type === "RULE-SET") assertRef(text.split(",")[1].trim(), owner);
    return text;
  }
  function finish() {
    // Main rules were emitted directly as RULE-SET; this also migrates retained
    // legacy sub-rules, including nested logical conditions, in their old order.
    config.rules = config.rules.map(r => v14WalkRule(r, convertAtom, "rules"));
    for (const [name, rules] of Object.entries(config["sub-rules"] || {}))
      config["sub-rules"][name] = rules.map(r => v14WalkRule(r, convertAtom, "sub-rules." + name));
    const s = config.sniffer || {};
    for (const key of ["force-domain", "skip-domain", "skip-src-address", "skip-dst-address"])
      if (s[key] != null) s[key] = v14Strings(s[key], "sniffer." + key).map(x => convertValue(x, key.endsWith("domain"), "sniffer." + key));
    for (const field of ["nameserver-policy", "proxy-server-nameserver-policy"]) if (config.dns[field]) {
      const result = {};
      for (const [key, value] of Object.entries(config.dns[field])) {
        const newKey = convertValue(key, true, "dns." + field);
        if (Object.prototype.hasOwnProperty.call(result, newKey)) v14Fail("DNS policy 迁移后键冲突：" + newKey);
        result[newKey] = value;
      }
      config.dns[field] = result;
    }
    // Providers retained by an old sub-rule or sniffer may already be ours.
    for (const [name, p] of Object.entries(sets)) {
      const src = v14ManagedSource(name, p);
      if (src) {
        const selected = ref(src.kind, src.tag);
        if (selected !== name) {
          // Alias required by a preserved external reference: own cache filename.
          sets[name] = {...sets[selected], path: "./ruleset/v12-managed/alias-" + v14Hash(name) + "-" + v14Hash(src.url) + "." + src.format};
          generated.set(name, {...src, name, path: sets[name].path, proxy: downloadProxy});
        }
        continue;
      }
      if (p.behavior === "classical") {
        if (p.type !== "inline") v14Fail("继承的外部 classical rule-provider " + name + " 内容在脚本执行时不可见，无法排除其中的 Geo/ASN 依赖。请先改为可检查的 inline 规则或 domain/ipcidr 规则源；原对象未静默删除。");
        for (const item of v14Strings(p.payload, "rule-provider " + name + ".payload"))
          v14WalkRule(item, (type, text, owner) => {
            if (["GEOSITE", "GEOIP", "SRC-GEOIP", "IP-ASN", "SRC-IP-ASN", "RULE-SET", "SUB-RULE", "MATCH"].includes(type))
              v14Fail(owner + " 含不能保真放入 classical provider 的 " + type + "；请移到 sub-rules 后再迁移，不能在 classical 内嵌 RULE-SET。");
            return text;
          }, "rule-provider " + name);
      }
    }
    // DNS bootstrap and DIRECT remain untouched. Stop automatic local Geo file
    // updates in the produced core configuration; this does not control UI geo
    // downloads a client application might independently choose to perform.
    config["geo-auto-update"] = false;
    for (const k of ["geox-url", "geo-update-interval", "geodata-mode", "geodata-loader", "geosite-matcher"]) delete config[k];
    for (const r of config.rules) v14WalkRule(r, verifyAtom, "rules");
    for (const [name, rs] of Object.entries(config["sub-rules"] || {})) for (const r of rs) v14WalkRule(r, verifyAtom, "sub-rules." + name);
    for (const [name, owner] of v14AuxRefs(config)) assertRef(name, owner, owner.includes("domain") ? true : false);
    for (const field of ["nameserver-policy", "proxy-server-nameserver-policy"]) for (const key of Object.keys(config.dns[field] || {})) {
      if (/^geosite:|^geoip:/i.test(key)) v14Fail("DNS 仍依赖 Geo 数据。");
      if (/^rule-set:/i.test(key)) for (const name of key.slice(9).split(",")) assertRef(name.trim(), "dns." + field, true);
    }
    const paths = new Map();
    for (const [name, p] of Object.entries(sets)) if (p.path) {
      if (paths.has(p.path)) v14Fail("两个 rule-provider 共用缓存文件：" + paths.get(p.path) + " / " + name);
      paths.set(p.path, name);
    }
    return Array.from(generated.values());
  }
  return {ref, finish};
}

function v14ValidateDomainTables() {
  for (const [tag, snapshot] of Object.entries(V14_REVIEWED_DOMAINS)) {
    if (!V14_DOMAIN_TAGS.has(tag) || !v14Object(snapshot) ||
        snapshot.behavior !== (tag === "cn" ? "domain" : "classical") ||
        typeof snapshot.payloadText !== "string" || !snapshot.payloadText)
      v14Fail("无效内嵌分类器：" + tag);
    for (const row of snapshot.payloadText.split("\n")) {
      if (snapshot.behavior === "domain" ? !/^\+\.[a-z0-9._-]+$/.test(row) :
          !/^(?:DOMAIN|DOMAIN-SUFFIX),[^,\s]+$/.test(row) && !row.startsWith("DOMAIN-REGEX,"))
        v14Fail("无效内嵌域名规则：" + tag);
    }
  }
  const domain = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
  for (const service of [V14_SHARED_INFRA, ...V14_SERVICES, {name: "domestic", seeds: V14_DOMESTIC_SEEDS}]) {
    for (const field of ["seeds", "exact"]) {
      const values = service[field] === undefined && field === "exact" ? [] : service[field];
      if (!Array.isArray(values)) v14Fail("域名表必须是数组：" + service.name + "." + field);
      for (let i = 0; i < values.length; i++) {
        if (!Object.prototype.hasOwnProperty.call(values, i) || typeof values[i] !== "string" ||
            values[i].length > 253 || !domain.test(values[i]))
          v14Fail("无效域名：" + service.name + "." + field + "[" + i + "]");
      }
    }
  }
}

function main(input) {
  v14ValidateDomainTables();
  if (!v14Object(input)) v14Fail("覆写入口需要配置对象。");
  const config = v14Copy(input);
  const upgradingFromV13 = v14Object(config["x-v13-generated"]);
  const warnings = [];
  if (config.proxies != null && !Array.isArray(config.proxies)) v14Fail("proxies 必须是数组。");
  if (config["proxy-groups"] != null && !Array.isArray(config["proxy-groups"])) v14Fail("proxy-groups 必须是数组。");
  const previous = ["x-v14-generated", "x-v13-generated", "x-v12-generated", "x-v11-generated", "x-v10-generated", "x-v91-generated", "x-v9-generated"];
  const generatedGroups = new Set(), generatedProxies = new Set(), generatedSubRules = new Set();
  for (const key of previous) {
    const mark = config[key];
    if (!v14Object(mark)) continue;
    for (const name of (mark.groups || [])) generatedGroups.add(name);
    for (const name of (mark.proxies || [])) generatedProxies.add(name);
    for (const name of (mark.subRules || [])) generatedSubRules.add(name);
  }
  if (config["sub-rules"] != null && !v14Object(config["sub-rules"])) v14Fail("sub-rules 必须是对象。");
  if (v14Object(config["sub-rules"])) {
    const kept = {};
    for (const [name, rules] of Object.entries(config["sub-rules"])) if (!generatedSubRules.has(name)) kept[name] = rules;
    config["sub-rules"] = kept;
  }
  const rawProxies = Array.isArray(config.proxies) ? config.proxies : [];
  const originalGroups = Array.isArray(config["proxy-groups"]) ? config["proxy-groups"] : [];
  const providers = config["proxy-providers"] == null ? {} : config["proxy-providers"];
  if (!v14Object(providers)) v14Fail("proxy-providers 必须是对象。");
  const providerNames = Object.keys(providers);
  const allNodes = [];
  const nodeNames = new Set();
  const infoRe = new RegExp(V14.infoPattern, "i");
  for (const original of rawProxies) {
    if (!v14Object(original) || typeof original.name !== "string" || !original.type) v14Fail("存在无效节点。");
    if (generatedProxies.has(original.name) || original.type === "rematch") continue;
    if (nodeNames.has(original.name) || V14_BUILTINS.has(original.name)) v14Fail("节点名称重复或保留：" + original.name);
    const node = v14Copy(original);
    if (upgradingFromV13 && v14Transport(node) && node["ip-version"] === "ipv4")
      delete node["ip-version"]; // remove V13-injected preference; keep fresh subscriptions untouched
    nodeNames.add(node.name);
    allNodes.push(node);
  }
  const selectable = allNodes.filter(p => v14Transport(p) && !infoRe.test(p.name));
  if (!selectable.length && !providerNames.length) v14Fail("没有可拨号的节点或代理 provider。");
  config.proxies = allNodes;

  const oldGroupMap = new Map();
  for (const g of originalGroups) {
    if (!v14Object(g) || typeof g.name !== "string" || !g.type) v14Fail("原配置存在无效代理组。");
    if (generatedGroups.has(g.name) || /^@v(?:10[1-6]|11)-(?:node|provider|infra)/.test(g.name)) continue;
    if (oldGroupMap.has(g.name) || nodeNames.has(g.name) || V14_BUILTINS.has(g.name)) v14Fail("原代理组重名或名称冲突：" + g.name);
    oldGroupMap.set(g.name, v14Copy(g));
  }
  const retained = new Set();
  function retain(ref, owner) {
    if (!ref || V14_BUILTINS.has(ref) || nodeNames.has(ref)) return;
    const g = oldGroupMap.get(ref);
    if (!g) v14Fail(owner + " 引用了已删除或未知代理组：" + ref);
    if (retained.has(ref)) return;
    retained.add(ref);
    for (const child of v14Strings(g.proxies, g.name + ".proxies")) retain(child, g.name);
    if (g["empty-fallback"]) retain(g["empty-fallback"], g.name + ".empty-fallback");
    if (!g["include-all"] && !g["include-all-providers"]) for (const source of v14Strings(g.use, g.name + ".use")) if (!providers[source]) v14Fail(g.name + " 引用未知 provider：" + source);
  }
  v14InboundGuard(config);
  const legacyRuleProviders = v14KeepLegacy(config, retain, false); // explicit Geo references are migrated/checked below
  for (const node of allNodes) retain(node["dialer-proxy"], "节点 " + node.name);
  for (const [name, provider] of Object.entries(providers)) {
    if (!v14Object(provider)) v14Fail("provider 无效：" + name);
    if (nodeNames.has(name)) v14Fail("provider 与节点同名：" + name);
    if (!["http", "file", "inline"].includes(provider.type)) v14Fail("不支持的 provider 类型：" + name);
    if (provider.type === "http" && (typeof provider.url !== "string" || !/^https?:\/\//i.test(provider.url))) v14Fail("HTTP provider 缺少有效 URL：" + name);
    if (provider.type === "file" && !provider.path) v14Fail("file provider 缺少 path：" + name);
    if (provider.type === "inline" && (!Array.isArray(provider.payload) || !provider.payload.length)) v14Fail("inline provider 缺少 payload：" + name);
    // A missing or retired bootstrap policy is not permission to use DIRECT.
    // Explicit provider.proxy=DIRECT remains an intentional control-plane choice.
    // Cached providers remain usable; a first download needs an explicit route.
    if (!provider.proxy || generatedGroups.has(provider.proxy) || generatedProxies.has(provider.proxy)) provider.proxy = "REJECT";
    if (provider.type === "http" && provider.proxy === "REJECT")
      warnings.push("provider " + name + " 的引导出口为 REJECT；需要首次下载时明确设置 provider.proxy，绝不静默直连。");
    retain(provider.proxy, "provider " + name);
    provider.override = Object.assign({}, v14Object(provider.override) ? provider.override : {});
    if (upgradingFromV13 && provider.override["ip-version"] === "ipv4") delete provider.override["ip-version"];
    retain(provider.override["dialer-proxy"], "provider override " + name);
    // Filter provider members before explicit selector sentinels are added.
    // Group-level exclusion would also remove business DIRECT and public REJECT.
    provider["exclude-type"] = v14Unique(String(provider["exclude-type"] || "").split("|").filter(Boolean).concat(
      ["Direct", "Compatible", "Pass", "PassRule", "pass-rule", "Dns", "Rematch", "Reject", "RejectDrop", "reject-drop", "RejectNoDrop", "reject-no-drop"])).join("|");
    v14ProviderGuard(provider, name, retain, warnings, upgradingFromV13);
    if (provider.type === "http") {
      if (!provider.interval) provider.interval = V14.providerInterval;
      if (!provider.path) provider.path = "./providers/v12/" + v14Hash(name + "\n" + provider.url) + ".yaml";
    }
    provider["health-check"] = Object.assign({}, provider["health-check"] || {}, {
      enable: true, url: V14.testUrl, interval: V14.testInterval,
    });
  }
  const keptGroups = Array.from(retained, name => oldGroupMap.get(name));
  for (const g of keptGroups) {
    // Keep native include/filter semantics. Do not expand into explicit proxies.
    g.hidden = true;
  }

  const occupied = new Set([...V14_BUILTINS, ...nodeNames, ...providerNames, ...retained]);
  const logicalGroups = V14_GROUP_ORDER;
  // Preserve previously generated names so stored selector choices survive upgrades.
  const previousGroupNames = new Map();
  for (const actual of generatedGroups) {
    const logical = actual.replace(/ \[V(?:12|13|14)(?:-\d+)?\]$/, "");
    if (logicalGroups.includes(logical) && !occupied.has(actual) && !previousGroupNames.has(logical))
      previousGroupNames.set(logical, actual);
  }
  const groupNames = new Map();
  function groupName(logical) {
    if (groupNames.has(logical)) return groupNames.get(logical);
    let name = previousGroupNames.get(logical) || logical, i = 0;
    while (occupied.has(name)) name = logical + " [V14" + (++i > 1 ? "-" + i : "") + "]";
    occupied.add(name); groupNames.set(logical, name); return name;
  }
  for (const logical of logicalGroups) groupName(logical);
  const rawNodeNames = selectable.map(p => p.name);
  const providerGroupFields = providerNames.length ? { use: providerNames.slice(), "exclude-filter": "(?i)^@v14-nontransport:|" + V14.infoPattern } : {};
  const groups = [];
  groups.push({ name: groupName("高纯净度AI用"), type: "select", proxies: ["REJECT"].concat(rawNodeNames),
    ...providerGroupFields, "default-selected": "REJECT", "empty-fallback": "REJECT" });
  groups.push({ name: groupName("自动选择"), type: "url-test", proxies: rawNodeNames.slice(), ...providerGroupFields,
    url: V14.testUrl, interval: V14.testInterval, lazy: true, "empty-fallback": "REJECT" });
  groups.push({name: groupName("高网速视频用"), type: "select", proxies: ["REJECT"].concat(rawNodeNames),
    ...providerGroupFields, "default-selected": "REJECT", "empty-fallback": "REJECT"});
  groups.sort((a,b) => logicalGroups.indexOf(Array.from(groupNames).find(([,name])=>name===a.name)[0]) - logicalGroups.indexOf(Array.from(groupNames).find(([,name])=>name===b.name)[0]));
  const business = logicalGroups.filter(name => !["高纯净度AI用", "高网速视频用", "自动选择"].includes(name));
  for (const logical of business) {
    const choices = [groupName("高纯净度AI用"), groupName("高网速视频用")].concat(logical === "漏网之鱼" ? [] : ["DIRECT"]);
    if (logical === "国内网站") choices.unshift("REJECT"); // Missing stored node must reject; first install still defaults to DIRECT.
    if (["Netflix", "Disney+", "Spotify", "哔哩国际"].includes(logical)) [choices[0],choices[1]] = [choices[1],choices[0]];
    groups.push({ name: groupName(logical), type: "select", proxies: choices.concat(rawNodeNames), ...providerGroupFields,
      "default-selected": logical === "国内网站" ? "DIRECT" : choices[0], "empty-fallback": "REJECT" });
  }
  config["proxy-groups"] = groups.concat(keptGroups);
  config["proxy-providers"] = providers;
  config["rule-providers"] = legacyRuleProviders;
  const managedRules = v14RuleRegistry(config, groupName("高纯净度AI用"));
  const ruleSet = (kind, tag) => managedRules.ref(kind, tag);

  const embeddedNames = new Map();
  function embeddedDomainSet(tag) {
    if (embeddedNames.has(tag)) return embeddedNames.get(tag);
    const snapshot = V14_REVIEWED_DOMAINS[tag];
    if (!snapshot) v14Fail("缺少已审核内嵌分类器：" + tag);
    const base = "v14-domains-" + tag.replace(/@/g, "_at_"), sets = config["rule-providers"];
    let name = base, n = 1;
    while (Object.prototype.hasOwnProperty.call(sets, name)) name = base + "-" + (++n);
    sets[name] = {type: "inline", behavior: snapshot.behavior, payload: snapshot.payloadText.split("\n")};
    embeddedNames.set(tag, name); return name;
  }
  function addDomainSet(tag, policy) {
    // Keep the old priority. Reviewed baseline first, remote additions next.
    if (V14_REVIEWED_DOMAINS[tag]) add("RULE-SET," + embeddedDomainSet(tag), policy);
    add("RULE-SET," + ruleSet("domain", tag), policy);
  }

  // Inline providers are immutable, require no download, and also drive DNS.
  const coreNames = new Map();
  for (const [logical, payload] of Object.entries(V14_COMPANY_CORE)) {
    const base = "v14-core-" + v14Hash(logical), sets = config["rule-providers"];
    let name = base, n = 1;
    while (Object.prototype.hasOwnProperty.call(sets, name)) name = base + "-" + (++n);
    sets[name] = {type: "inline", behavior: "classical", payload: payload.slice()};
    coreNames.set(logical, name);
  }
  const cdnGuardBase = "v14-cdn-shared-guard", cdnSets = config["rule-providers"];
  let cdnGuardName = cdnGuardBase, cdnGuardIndex = 1;
  while (Object.prototype.hasOwnProperty.call(cdnSets, cdnGuardName)) cdnGuardName = cdnGuardBase + "-" + (++cdnGuardIndex);
  cdnSets[cdnGuardName] = {type:"inline", behavior:"classical", payload:V14_CDN_SHARED_GUARDS.slice()};
  const rules = ["DOMAIN,v14-runtime-check.invalid,REJECT"], emitted = new Set();
  function add(match, policy, noResolve) {
    const suffix = noResolve ? ",no-resolve" : "", key = match + suffix;
    if (emitted.has(key)) return;
    emitted.add(key); rules.push(match + "," + policy + suffix);
    if (policy !== "DIRECT" && policy !== "REJECT") rules.push(match + ",REJECT" + suffix);
  }
  for (const d of V14.privateNames) add("DOMAIN-SUFFIX," + d, "DIRECT");
  for (const d of V14.manualDirect) add("DOMAIN-SUFFIX," + d, "DIRECT");
  for (const d of V14.manualProxy) add("DOMAIN-SUFFIX," + d, groupName("高纯净度AI用"));
  add("DST-PORT,853", "REJECT");
  for (const match of V14_EXTERNAL_DNS_RULES) add(match, "REJECT");
  for (const d of V14_GOOGLE_PLAY_DELIVERY_SEEDS) add("DOMAIN-SUFFIX," + d, groupName("谷歌服务"));
  for (const host of V14_OPENAI_VOICE_HOSTS) add("DOMAIN," + host, groupName("OpenAI 服务"));
  // Reviewed exact Azure tenants below precede the generic shared suffix.
  // Dedicated company hosts on third-party infrastructure remain precise.
  for (const service of V14_SERVICES) for (const d of service.exact || []) add("DOMAIN," + d, groupName(service.name));
  add("RULE-SET," + cdnGuardName, groupName("公共基础服务"));
  for (const suffix of V14_UNIDENTIFIED_VOICE_SUFFIXES) add("DOMAIN-SUFFIX," + suffix, groupName("公共基础服务"));
  function emitService(service) {
    const policy = groupName(service.name);
    for (const d of service.exact || []) add("DOMAIN," + d, policy);
    for (const d of service.seeds) add("DOMAIN-SUFFIX," + d, policy);
    if (coreNames.has(service.name)) add("RULE-SET," + coreNames.get(service.name), policy);
    for (const tag of service.sets) addDomainSet(tag, policy);
  }
  // Shared infrastructure must win over broad cloud-provider ownership lists.
  emitService(V14_SHARED_INFRA);
  for (const service of V14_SERVICES) emitService(service);
  for (const ip of V14_OPENAI_VOICE_IPV4) add("IP-CIDR," + ip, groupName("OpenAI 服务"), true);
  for (const ip of V14_TELEGRAM_CIDRS) add((ip.includes(":") ? "IP-CIDR6," : "IP-CIDR,") + ip, groupName("Telegram"), true);
  for (const service of V14_SERVICES) for (const tag of service.ips || [])
    add("RULE-SET," + ruleSet("ip", tag), groupName(service.name), true);
  // Known corporate domains win even with private/ULA destination metadata.
  for (const ip of V14_PRIVATE_IPS) add((ip.includes(":") ? "IP-CIDR6," : "IP-CIDR,") + ip, "DIRECT", true);
  addDomainSet("private", "DIRECT");
  // Unknown domestic STUN servers are protected, without stealing Google's.
  for (const host of V14.domesticStunDns)
    if (!V14_SERVICES.some(s => s.seeds.some(d => host === d || host.endsWith("."+d))))
      add("DOMAIN," + host, groupName("漏网之鱼"));
  // Corporate/LAN/manual rules above retain priority. Recognisable generic
  // STUN stays protected before domestic domain classifications.
  for (const network of ["TCP", "UDP"]) {
    for (const port of V14.stunPorts) add("AND,((NETWORK," + network + "),(DST-PORT," + port + "),(NOT,((IN-TYPE,INNER))))", groupName("漏网之鱼"));
    for (const host of V14.stunHostPatterns) add("AND,((NETWORK," + network + "),(DOMAIN-WILDCARD," + host + "),(NOT,((IN-TYPE,INNER))))", groupName("漏网之鱼"));
  }
  const domesticPolicy = groupName("国内网站");
  for (const d of V14_DOMESTIC_SEEDS) add("DOMAIN-SUFFIX," + d, domesticPolicy);
  for (const tag of V14_DOMESTIC_SETS) addDomainSet(tag, domesticPolicy);
  addDomainSet("cn", domesticPolicy);
  add("DOMAIN-SUFFIX,cn", domesticPolicy);
  // Unclassified IP-only public UDP cannot reach geographic TCP shortcuts.
  add("AND,((NETWORK,UDP),(NOT,((IN-TYPE,INNER))))", groupName("漏网之鱼"));
  add("RULE-SET," + ruleSet("ip", "cn"), domesticPolicy, true);
  add("MATCH", groupName("漏网之鱼")); config.rules = rules; config.mode = "rule";

  const dnsPolicy = {};
  for (const d of V14.privateNames) dnsPolicy["+." + d] = ["system"];
  for (const d of V14.manualDirect) dnsPolicy["+." + d] = V14.directDns.slice();
  for (const d of V14.manualProxy) dnsPolicy["+." + d] = v14DnsFor(groupName("高纯净度AI用"));
  for (const host of V14.domesticStunDns)
    if (!V14_SERVICES.some(s => s.seeds.some(d => host === d || host.endsWith("."+d))))
      dnsPolicy[host] = v14DnsFor(groupName("漏网之鱼"));
  for (const suffix of V14_UNIDENTIFIED_VOICE_SUFFIXES) dnsPolicy["." + suffix] = v14DnsFor(groupName("公共基础服务"));
  for (const d of V14_GOOGLE_PLAY_DELIVERY_SEEDS) dnsPolicy["+." + d] = v14DnsFor(groupName("谷歌服务"));
  for (const service of [V14_SHARED_INFRA].concat(V14_SERVICES)) {
    const servers = v14DnsFor(groupName(service.name));
    for (const d of service.exact || []) dnsPolicy[d] = servers;
    // Specific shared Storage names must beat broad google.com/googleapis.com
    // literals. Exact WebPubSub exceptions override the shared namespace policy.
    for (const d of service.seeds) if (service.name !== V14_SHARED_INFRA.name || d !== "webpubsub.azure.com")
      if (dnsPolicy["+." + d] === undefined) dnsPolicy["+." + d] = servers;
  }
  dnsPolicy["rule-set:" + cdnGuardName] = v14DnsFor(groupName("公共基础服务"));
  for (const logical of ["OpenAI 服务", "Anthropic 服务", "公共基础服务", "谷歌服务", "微软生态"])
    dnsPolicy["rule-set:" + coreNames.get(logical)] = v14DnsFor(groupName(logical));
  for (const service of V14_SERVICES)
    for (const tag of service.sets) {
      if (V14_REVIEWED_DOMAINS[tag]) dnsPolicy["rule-set:" + embeddedDomainSet(tag)] = v14DnsFor(groupName(service.name));
      dnsPolicy["rule-set:" + ruleSet("domain", tag)] = v14DnsFor(groupName(service.name));
    }
  // Existing corporate literals and rule-set policies above win. The
  // reviewed domestic domain inventories now use the same selectable egress.
  // Name-only STUN protection cannot identify a hidden protocol on an ordinary host.
  let stunDNSSet = "v14-generic-stun-domain-guard", stunDNSIndex = 1;
  while (config["rule-providers"][stunDNSSet]) stunDNSSet = "v14-generic-stun-domain-guard-" + (++stunDNSIndex);
  config["rule-providers"][stunDNSSet] = {type:"inline", behavior:"classical", payload:V14.stunHostPatterns.map(d=>"DOMAIN-WILDCARD,"+d)};
  dnsPolicy["rule-set:" + stunDNSSet] = v14DnsFor(groupName("漏网之鱼"));
  // Preserve existing local/private-name fallback unless an earlier corporate
  // policy or explicit system/manual literal already identifies it.
  dnsPolicy["rule-set:" + embeddedDomainSet("private")] = v14DnsFor(groupName("漏网之鱼"));
  dnsPolicy["rule-set:" + embeddedDomainSet("category-doh")] = v14DnsFor(groupName("漏网之鱼"));
  let domesticSeedsSet = "v14-domestic-protocol-seeds", domesticSetIndex = 1;
  while (config["rule-providers"][domesticSeedsSet]) domesticSeedsSet = "v14-domestic-protocol-seeds-" + (++domesticSetIndex);
  config["rule-providers"][domesticSeedsSet] = {type:"inline", behavior:"classical", payload:V14_DOMESTIC_SEEDS.concat(["cn"]).map(d=>"DOMAIN-SUFFIX,"+d)};
  dnsPolicy["rule-set:" + domesticSeedsSet] = v14DnsFor(domesticPolicy);
  for (const tag of V14_DOMESTIC_SETS.concat(["cn"])) {
    if (V14_REVIEWED_DOMAINS[tag]) dnsPolicy["rule-set:" + embeddedDomainSet(tag)] = v14DnsFor(domesticPolicy);
    dnsPolicy["rule-set:" + ruleSet("domain", tag)] = v14DnsFor(domesticPolicy);
  }
  const oldDns = v14Object(config.dns) ? config.dns : {};
  config.dns = Object.assign({}, oldDns, {
    enable: true, ipv6: true, "fake-ip-range6": oldDns["fake-ip-range6"] || "fdfe:dcba:9876::1/64", "enhanced-mode": "fake-ip", "fake-ip-range": "198.18.0.1/16",
    "fake-ip-filter-mode": "blacklist",
    // Chromium treats the IPv6 Fake-IP ULA as local network access. Return
    // real A/AAAA for this public API; nameserver-policy still uses OpenAI's
    // chosen group, and the existing company rules retain fail-closed routing.
    "fake-ip-filter": V14.privateNames.map(d => "+." + d).concat(["api.openai.com"]), "use-hosts": true,
    "use-system-hosts": true, "respect-rules": false, "prefer-h3": false,
    "default-nameserver": V14.bootstrapDns.slice(), "proxy-server-nameserver": V14.nodeDns.slice(),
    nameserver: v14DnsFor(groupName("漏网之鱼")), fallback: [], "nameserver-policy": dnsPolicy,
    "direct-nameserver": V14.directDns.slice(), "direct-nameserver-follow-policy": true,
  });
  delete config.dns["fallback-filter"];
  delete config.dns["proxy-server-nameserver-policy"];
  if (config["x-v11-generated"] && config.dns.listen === "127.0.0.1:1053") delete config.dns.listen;

  config.ipv6 = true;
  config.profile = Object.assign({}, v14Object(config.profile) ? config.profile : {}, { "store-selected": true, "store-fake-ip": true });
  // Android FlClash/VpnService owns the actual TUN file descriptor, routes,
  // DNS hijack and IPv6 OS routes. Preserve the client-managed TUN object; core DNS/IPv6 are enabled above.
  const oldSniffer = v14Object(config.sniffer) ? config.sniffer : {};
  config.sniffer = Object.assign({}, oldSniffer, { enable: true, "force-dns-mapping": true,
    "parse-pure-ip": true, "override-destination": false,
    sniff: Object.assign({}, v14Object(oldSniffer.sniff) ? oldSniffer.sniff : {}, {
      HTTP: { ports: [80, "8080-8880"], "override-destination": false },
      TLS: { ports: [443, 8443] }, QUIC: { ports: [443, 8443] },
    }),
  });

  const ruleSources = managedRules.finish();
  // Guard against regressions when sharing code with the desktop build.
  for (const key of ["tun", "allow-lan", "bind-address", "mixed-port", "external-controller", "secret", "authentication"]) {
    if (JSON.stringify(config[key]) !== JSON.stringify(input[key]))
      v14Fail("Android 平台字段不应由覆写改动：" + key);
  }
  const ipv6DeviceWarning = "V14.2 已开启核心双栈；请同时在 FlClash Android 开启 IPv6，确保 VpnService 接管 IPv6 路由。";
  const priorMarker = input["x-v14-generated"];
  // Keep this device reminder on replay; generated core flags cannot certify VpnService.
  if (input.ipv6 === false || (input.dns || {}).ipv6 === false ||
      (v14Object(priorMarker) && priorMarker.version === V14.version &&
       Array.isArray(priorMarker.validationWarnings) && priorMarker.validationWarnings.includes(ipv6DeviceWarning)))
    warnings.push(ipv6DeviceWarning);
  // Check the relationships that caused V11 to fail at runtime.
  const allGroups = new Map(config["proxy-groups"].map(g => [g.name, g]));
  if (allGroups.size !== config["proxy-groups"].length) v14Fail("代理组名称冲突。");
  const known = new Set([...V14_BUILTINS, ...nodeNames, ...allGroups.keys()]);
  for (const g of config["proxy-groups"]) {
    for (const ref of (g.proxies || [])) if (!known.has(ref)) v14Fail("未知代理引用：" + g.name + " -> " + ref);
    if (!g["include-all"] && !g["include-all-providers"]) for (const ref of v14Strings(g.use, g.name + ".use")) if (!providers[ref]) v14Fail("未知 provider 引用：" + g.name + " -> " + ref);
  }
  for (const logical of business) {
    const g = allGroups.get(groupName(logical));
    if (!g.proxies.includes(groupName("高纯净度AI用")) ||
        (logical === "漏网之鱼" ? g.proxies.includes("DIRECT") : !g.proxies.includes("DIRECT")))
      v14Fail("业务组的 DIRECT 边界不正确：" + logical);
    for (const ref of rawNodeNames) if (!g.proxies.includes(ref)) v14Fail("业务组缺少节点：" + logical + " -> " + ref);
    for (const ref of providerNames) if (!(g.use || []).includes(ref)) v14Fail("业务组缺少 provider：" + logical + " -> " + ref);
  }
  for (let i = 0; i < rules.length; i++) {
    const r = rules[i];
    const parts = r.split(",");
    const target = parts[parts.length - 1] === "no-resolve" ? parts[parts.length - 2] : parts[parts.length - 1];
    if (!known.has(target)) v14Fail("未知规则目标：" + r);
    if (target !== "DIRECT" && target !== "REJECT" && rules[i + 1] !== r.replace("," + target + (r.endsWith(",no-resolve") ? ",no-resolve" : ""), ",REJECT" + (r.endsWith(",no-resolve") ? ",no-resolve" : ""))) {
      v14Fail("UDP 防回落规则不相邻：" + r);
    }
  }
  if (rules[rules.length - 2] !== "MATCH," + groupName("漏网之鱼") || rules[rules.length - 1] !== "MATCH,REJECT") v14Fail("末尾 UDP 防回落缺失。");
  v14GraphCheck(config, warnings);
  for (const key of previous) delete config[key];
  config["x-v14-generated"] = { version: V14.version, revision: "domestic-selector-r1-20261010", routingRevision: "domestic-selector-r1-20261010", compatibilityRevision: "api-real-ip-r1-20261010", groups: groups.map(g => g.name), proxies: [],
    platform: "android",
    ruleDataMode: "critical-inline-pinned-full-remote-no-local-geo",
    ruleProviders: ruleSources.map(s => s.name), ruleSources,
    auditRepairRevision: "balanced-r1", domesticProtocolRevision: "domestic-protocol-r1",
    embeddedDomainClassifiers: Array.from(embeddedNames, ([tag, provider]) => ({tag, provider, records: V14_REVIEWED_DOMAINS[tag].payloadText.split("\n").length})),
    immutableCompanyCore: Array.from(coreNames, ([group, provider]) => ({group, provider, records: V14_COMPANY_CORE[group].length})),
    ruleDownloadProxy: groupName("高纯净度AI用"), ruleInterval: V14.ruleInterval,
    ruleReadiness: "not-observable-in-JS-check-core-providers",
    dnsMode: "company-core-group-affine-dot-no-reuse-safe-default", udpMode: "company-first-unknown-public-udp-proxy-or-reject",
    notes: "Dual-stack proxy dialing enabled; remote exit IP family remains node-controlled; domain-to-group DNS affinity; live connections and caches survive selection changes",
    acceptedBoundaries: ["remote-node-to-destination-ip-family", "TUN and browser WebRTC enforcement outside JS", "per-flow DNS affinity"],
    openIssues: ["device/browser DNS caches and application connection migration", "Windows/Android device TUN and IPv6 leak acceptance"],
    validationWarnings: v14Unique(warnings),
    releaseStatus: "offline-regression-tested-device-acceptance-pending" };
  if (typeof console !== "undefined" && console.log) console.log("[V14 Android] " + selectable.length + " 个可用节点、" + providerNames.length + " 个 provider、" + business.length + " 个可选业务组；公司规则优先；未分类公网 UDP 不直连，国内 TCP 由国内网站组选择，默认 DIRECT。");
  if (typeof console !== "undefined" && console.log) console.log("[V14 Android] " + ruleSources.length + " 个远程分类按 24h 更新；首次无缓存须可用节点。检查规则已加载，不要把生成成功当成下载成功。");
  if (typeof console !== "undefined" && console.log) for (const w of v14Unique(warnings)) console.log("[V14 检查范围] " + w);
  return v14NetworkDefaults(config);
}
