/* OpenVerse VM, linked into each map.wasm together with that map's OVBC.
   Host input is an array of event strings. No Verse evaluation happens in JS. */
#include "vx_runtime.h"
#include <emscripten/emscripten.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define PROGRAM_CAP (512u * 1024u)
static unsigned char linked_program[PROGRAM_CAP + 4];
EMSCRIPTEN_KEEPALIVE unsigned char *map_program_ptr(void) { return linked_program; }
EMSCRIPTEN_KEEPALIVE unsigned map_program_capacity(void) { return PROGRAM_CAP; }

/* Replace ONLY the OFEvents host-input stub with a typed []string literal.
   All user definitions and expressions remain those checked by OpenVerse. */
static int bind_events(vx_program *p, const char *history) {
    unsigned count = 0;
    size_t len = strlen(history);
    if (len > 32768) return 0;
    if (len) { count = 1; for (size_t i = 0; i < len; i++) if (history[i] == '\n') count++; }
    if (count > 256) return 0;
    vx_fn *fn = NULL;
    for (unsigned i = 0; i < p->nfns; i++) {
        if (p->fns[i].name_len == 8 && !memcmp(p->bytes + p->fns[i].name_off, "OFEvents", 8)) {
            fn = &p->fns[i]; break;
        }
    }
    if (!fn || fn->arity) return 0;
    vx_node *nodes = calloc(count + 1, sizeof(vx_node));
    if (!nodes) return 0;
    uint32_t *args = realloc(p->args, (p->nargs + count + 1) * sizeof(uint32_t));
    if (!args) { free(nodes); return 0; }
    p->args = args;
    uint8_t *bytes = realloc(p->bytes, p->nbytes + len + 1);
    if (!bytes) { free(nodes); return 0; }
    p->bytes = bytes;
    memcpy(p->bytes + p->nbytes, history, len);
    size_t start = 0;
    unsigned k = 0;
    for (size_t i = 0; count && i <= len; i++) {
        if (i == len || history[i] == '\n') {
            nodes[k].tag = VX_N_LIT; nodes[k].op = VX_LIT_STR;
            nodes[k].a = p->nbytes + start; nodes[k].b = i - start;
            p->args[p->nargs + k] = k;
            k++; start = i + 1;
        }
    }
    nodes[count].tag = VX_N_PRIM; nodes[count].op = VX_P_MKARR;
    nodes[count].b = count; nodes[count].c = p->nargs;
    p->nbytes += len; p->nargs += count;
    free(fn->nodes); fn->nodes = nodes; fn->nnodes = count + 1; fn->root = count;
    return 1;
}

/* This export executes the embedded map. history is UTF-8, newline separated.
   It can be called repeatedly. Each call deterministically replays the session,
   preserving Verse state/rollback without keeping an unbounded VM heap. */
EMSCRIPTEN_KEEPALIVE int map_run(const char *history, unsigned fuel) {
    unsigned size = linked_program[0] | (linked_program[1] << 8) |
                    (linked_program[2] << 16) | ((unsigned)linked_program[3] << 24);
    if (size == 0 || size > PROGRAM_CAP) { fputs("No linked map program.\n", stderr); return 4; }
    vx_program program;
    int loaded = vx_load(linked_program + 4, size, &program);
    if (loaded != VX_LOAD_OK) { fprintf(stderr, "Bytecode: %s\n", vx_load_reason(loaded)); return 4; }
    if (!bind_events(&program, history)) { vx_free_program(&program); fputs("Event input exceeds limits or OFEvents is missing.\n", stderr); return 4; }
    vx_opts opts;
    vx_outcome out;
    vx_default_opts(&opts);
    opts.fuel = fuel; opts.max_steps = fuel;
    opts.max_heap = (size_t)1 << 22; opts.max_slots = (size_t)1 << 18;
    opts.max_journal = (size_t)1 << 18; opts.max_out = (size_t)1 << 20;
    opts.max_vstack = (size_t)1 << 18; opts.max_depth = 1000;
    opts.stack_budget = (size_t)8 << 20;
    vx_run(&program, &opts, &out);
    int code = 0;
    if (out.kind == VX_R_LIMIT) { fprintf(stderr, "Resource limit: %s\n", vx_limit_name(out.code)); code = 3; }
    else if (out.kind != VX_R_OK && out.kind != VX_R_RET) {
        fprintf(stderr, "Verse execution: %s\n", out.kind == VX_R_FAIL ? "failure" : vx_err_name(out.code)); code = 2;
    } else if (out.outlen) { fwrite(out.out, 1, out.outlen, stdout); fflush(stdout); }
    vx_outcome_free(&out); vx_free_program(&program);
    return code;
}
