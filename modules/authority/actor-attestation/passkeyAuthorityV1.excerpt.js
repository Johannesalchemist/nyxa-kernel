// VERBATIM EXCERPT (canonicalization only) of the existing Human Gate module
// authority/passkeyAuthorityV1.js (Server B, Authority V2 candidate, lines 24-36).
// In deployment actorAttestation.mjs imports the REAL ./passkeyAuthorityV1.js; this
// excerpt exists only so the isolated tests run without the runtime tree.
const isObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);
export function canonicalHumanGate(value) {
    if (Array.isArray(value))
        return "[" + value.map(canonicalHumanGate).join(",") + "]";
    if (isObject(value))
        return "{" + Object.keys(value).sort()
            .map(k => JSON.stringify(k) + ":" + canonicalHumanGate(value[k])).join(",") + "}";
    const serialized = JSON.stringify(value);
    if (serialized === undefined)
        throw Error("invalid_signed_value");
    return serialized;
}
