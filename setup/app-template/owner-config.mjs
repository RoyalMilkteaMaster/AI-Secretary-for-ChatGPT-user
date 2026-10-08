// Unconfigured placeholder. tools/prepare.mjs writes a validated copy into
// work/app. While configured is false the Worker refuses mail, OAuth, MCP and
// progress routes; only the public home/privacy pages and /health respond.
export const OWNER=Object.freeze({configured:false,sender:'',recipient:'',calendar:'',origin:'',policy_date:''});
