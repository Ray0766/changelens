// Shared helpers for the held-out round 5 cases of author "h" (Typst 0.15).
// The same source is compiled twice: sys.inputs.v = "before" or "after".
#let V = sys.inputs.at("v", default: "before")
#let AFTER = V == "after"
// ed[old][new]: text that differs between the versions
#let ed(a, b) = if AFTER { b } else { a }
// ins[new]: text that exists only in the after version
#let ins(b) = if AFTER { b }
// del[old]: text that exists only in the before version
#let del(a) = if not AFTER { a }
