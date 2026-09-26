/* Embedded NNUE networks for the WebAssembly build.
 * incbin (.incbin asm) is not supported by the wasm LLVM backend,
 * so we embed the nets with C23 #embed instead. Symbol names match
 * what incbin would have produced (INCBIN_PREFIX g_). */

__attribute__((aligned(64))) const unsigned char g_nnueData[] = {
#embed "../nets/fingolfin.nnue"
};
const unsigned int g_nnueSize = sizeof(g_nnueData);

__attribute__((aligned(64))) const unsigned char g_nnue2Data[] = {
#embed "../nets/finarfin.nnue"
};
const unsigned int g_nnue2Size = sizeof(g_nnue2Data);

__attribute__((aligned(64))) const unsigned char g_nnue3Data[] = {
#embed "../nets/feanor.nnue"
};
const unsigned int g_nnue3Size = sizeof(g_nnue3Data);
