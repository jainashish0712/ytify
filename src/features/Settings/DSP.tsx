import { createSignal } from 'solid-js';
import { t } from '@stores';
import { config, setConfig } from '@utils';
import { equalizerInstance } from '@stores/player'; // Import the instance

// A re-usable Toggle component, similar to the one in the main settings page.
const Toggle = (props: { name: string, checked: boolean, onclick: (e: MouseEvent) => void }) => {
    const [checked, setChecked] = createSignal(props.checked);

    return (
        <span
            role="checkbox"
            aria-checked={checked()}
            tabindex="0"
            onclick={(e) => {
                props.onclick(e);
                setChecked(config.dspEnabled); // Read the new value from config
            }}
            onkeydown={(e) => {
                if (e.key === ' ' || e.key === 'Enter') {
                    e.preventDefault();
                    props.onclick(e as unknown as MouseEvent);
                    setChecked(config.dspEnabled); // Read the new value from config
                }
            }}
        >
            <label>{t(props.name as TranslationKeys)}</label>
            <i class={checked() ? 'ri-toggle-fill' : 'ri-toggle-line'}></i>
        </span>
    );
};


export default function DSP() {
    // We'll add a new config flag 'dspEnabled' to control the DSP.
    // The default value will be false.
    if (config.dspEnabled === undefined) {
        setConfig('dspEnabled', false);
    }
    
    // Send initial state to DSP
    equalizerInstance?.postMessageToDsp({ type: 'SET_ENABLED', value: !!config.dspEnabled });

    return (
        <>
            <div class="divider" />
            <h3>DSP Settings</h3>
            <Toggle
                name='Enable JamesDSP'
                checked={Boolean(config.dspEnabled)}
                onclick={() => {
                    const newState = !config.dspEnabled;
                    setConfig('dspEnabled', newState);
                    // Post message to the AudioWorklet
                    equalizerInstance?.postMessageToDsp({ type: 'SET_ENABLED', value: newState });
                }}
            />
        </>
    );
}
