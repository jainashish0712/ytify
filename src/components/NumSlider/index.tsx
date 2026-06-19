import { onMount, Component, onCleanup, createEffect } from 'solid-js';
import './style.css';
import RangeSlider from "https://esm.sh/svelte-range-slider-pips";
import 'https://esm.sh/number-flow';

declare module "solid-js" {
  namespace JSX {
    interface IntrinsicElements {
      'number-flow': any;
    }
  }
}

interface NumSliderProps {
    min?: number;
    max?: number;
    value?: number;
    suffix?: string;
    showPips?: boolean;
    onValueChange?: (value: number) => void;
}

export const NumSlider: Component<NumSliderProps> = (props) => {
    let sliderContainer!: HTMLDivElement;
    let flowElement!: HTMLElement & { numberSuffix: string; update: (v: any) => void; animated: boolean; };
    let sliderInstance: any;

    onMount(() => {
        const min = props.min ?? 0;
        const max = props.max ?? 100;
        const startValue = props.value ?? min;
        const suffix = props.suffix ?? "";
        
        sliderInstance = new RangeSlider({
            target: sliderContainer,
            props: {
                value: startValue,
                min,
                max,
                range: 'min',
                pips: props.showPips ?? false,
                all: 'label',
                suffix: suffix,
                springValues: { stiffness: 0.125, damping: 0.4 },
            }
        });

        if (flowElement) {
            flowElement.numberSuffix = suffix;
            flowElement.update(startValue);
            flowElement.classList.add('initialised');
        }

        const setFlow = (v: number) => {
            if (flowElement) {
                flowElement.update(v);
                updateFlowPosition(v);
            }
        }

        sliderInstance.$on('change', ({ detail }: any) => {
            setFlow(detail.value);
            if(props.onValueChange) {
                props.onValueChange(detail.value);
            }
        });

        const updateFlowPosition = (v?: number) => {
            if (!flowElement) return;
            const sliderEl = sliderContainer.querySelector('.rangeSlider');
            const handleEl = sliderContainer.querySelector('.rangeHandle');
            if (!sliderEl || !handleEl) return;

            requestAnimationFrame(() => {
                let pos = parseFloat( (handleEl as HTMLElement).style.getPropertyValue('--handle-pos') || '0');
                let length = parseFloat( (sliderEl as HTMLElement).style.getPropertyValue('--slider-length') || '0');
                if ( v !== undefined ) {
                    pos = ((v - min) / (max - min)) * 100;
                }
                flowElement.classList.toggle( 'on-left', pos > 70 );
                flowElement.style.setProperty( '--handle-pos', String(pos) );
                flowElement.style.setProperty( '--slider-length', String(length) );
            });
        };
        
        updateFlowPosition(startValue);
    });

    createEffect(() => {
        if (sliderInstance && props.value !== undefined) {
            sliderInstance.$set({ value: props.value });
        }
    });

    onCleanup(() => {
        if (sliderInstance) {
            sliderInstance.$destroy();
        }
    });

    return (
        <div class="num-slider-container">
            <div ref={sliderContainer} class="num-slider">
                <number-flow ref={flowElement} data-will-change></number-flow>
            </div>
        </div>
    );
};
