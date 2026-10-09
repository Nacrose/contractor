# Generated bindings

M02-T02 generates TypeScript output under `typescript/` and Dart output under
`dart/`. Dart bindings are also generated under `../dart/lib/generated/` as the
local package import surface; both outputs are checked for drift. Generated
files are committed and must never be hand-edited. The Rust
directory is reserved: Rust generation and fixture compilation are blocked until
the repository has a real Rust target. No Rust stub or pass is claimed.
