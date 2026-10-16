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
