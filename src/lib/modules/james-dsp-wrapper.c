// src/lib/modules/james-dsp-wrapper.c
#include "jamesdsp/jdsp/jdsp_header.h"
#include <stdlib.h>

// Forward declare the function from the JamesDSP code
void BassBoostSetParam(JamesDSPLib *jdsp, float maxG);

static JamesDSPLib *jdsp_instance = NULL;

void init_dsp(int sample_rate, int block_size) {
    if (jdsp_instance != NULL) {
        JamesDSPFree(jdsp_instance);
        free(jdsp_instance);
    }
    jdsp_instance = (JamesDSPLib *)malloc(sizeof(JamesDSPLib));
    JamesDSPInit(jdsp_instance, block_size, sample_rate);
}

void process_dsp(float *input_ptr, float *output_ptr, int block_size) {
    if (jdsp_instance != NULL) {
        pfloat32Multiplexed(jdsp_instance, input_ptr, output_ptr, block_size);
    }
}

void set_bass_boost_strength(float strength) {
    if (jdsp_instance != NULL) {
        BassBoostSetParam(jdsp_instance, strength);
    }
}
