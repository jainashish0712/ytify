export interface EventListener {
    type: string;
    callback: Function;
}
export declare class EventEmitter {
    protected listeners: EventListener[];
    /**
     * Add event listener.
     */
    addEventListener(type: string, callback: Function): EventListener;
    /**
     * Remove event listener.
     * @param listener - Event listener to remove.
     */
    removeEventListener(listener: unknown): void;
    /**
     * Remove event listeners.
     * @param listeners - List of event listeners to remove.
     */
    removeEventListeners(listeners: EventListener[]): void;
    /**
     * Trigger event.
     * @param ce - Custom event to dispatch.
     */
    dispatchEvent(ce: Event): void;
}
//# sourceMappingURL=eventemitter.d.ts.map