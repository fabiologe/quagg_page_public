/**
 * useInteractionManager.js
 * Acts as the centralized "Traffic Controller" for mouse interactions in the 3D Editor.
 * Prevents "God Object" anti-pattern by preventing MapEditor3D from handling raw logic.
 */
import * as THREE from 'three';

/**
 * @param {import('vue').Ref<string>} activeToolRef - Reactive reference to the currently active tool name
 * @param {Object} tools - Dictionary of tool composables (e.g., { DRAW: useDrawTool() })
 */
export function useInteractionManager(activeToolRef, tools) {

    const pointer = new THREE.Vector2();

    /**
     * Normalizes mouse coordinates to NDC (Normalized Device Coordinates) -1 to +1
     * @param {MouseEvent} event 
     * @param {HTMLElement} container 
     */
    const updateMouseCoordinates = (event, container) => {
        if (!container) return;
        const rect = container.getBoundingClientRect();
        pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    };

    /**
     * Central Click Handler
     * Routes the click event to the active tool's onClick method.
     * @param {MouseEvent} event
     * @param {Object} context - { camera, scene, container, raycaster }
     */
    const handleClick = (event, context) => {
        // 1. Update Coordinates
        updateMouseCoordinates(event, context.container);

        // 2. Prepare Raycaster
        if (context.camera && context.raycaster) {
            context.raycaster.setFromCamera(pointer, context.camera);
        }

        // 3. Delegate to Active Tool
        const currentToolName = activeToolRef.value;
        const tool = tools[currentToolName];

        if (tool && typeof tool.onClick === 'function') {
            return tool.onClick({
                event,
                ...context,
                pointer // Pass normalized pointer
            });
        }
        return null;
    };

    /**
     * Central Move Handler
     * Routes the move event to the active tool's onMove method (e.g. for ghosts/hover).
     * @param {MouseEvent} event
     * @param {Object} context - { camera, scene, container, raycaster }
     */
    const handleMouseMove = (event, context) => {
        // 1. Update Coordinates
        updateMouseCoordinates(event, context.container);

        // 2. Prepare Raycaster
        if (context.camera && context.raycaster) {
            context.raycaster.setFromCamera(pointer, context.camera);
        }

        // 3. Delegate to Active Tool
        const currentToolName = activeToolRef.value;
        const tool = tools[currentToolName];

        if (tool && typeof tool.onMove === 'function') {
            tool.onMove({
                event,
                ...context,
                pointer
            });
        }
    };

    /**
     * Central Right Click Handler (Context Menu)
     * Used for Cancelling or Resetting
     */
    const handleRightClick = (event, context) => {
        event.preventDefault(); // Block browser context menu

        const currentToolName = activeToolRef.value;
        const tool = tools[currentToolName];

        if (tool && typeof tool.onRightClick === 'function') {
            return tool.onRightClick({
                event,
                ...context
            });
        }
        return null;
    };

    /**
     * Central Double Click Handler
     * Used for "Finish" or special actions
     */
    const handleDoubleClick = (event, context) => {
        updateMouseCoordinates(event, context.container);

        // Prepare Raycaster
        if (context.camera && context.raycaster) {
            context.raycaster.setFromCamera(pointer, context.camera);
        }

        const currentToolName = activeToolRef.value;
        const tool = tools[currentToolName];

        if (tool && typeof tool.onDoubleClick === 'function') {
            return tool.onDoubleClick({
                event,
                ...context,
                pointer
            });
        }
        return null;
    };

    /**
     * Mouse Down Handler (Start Drag/Paint)
     */
    const handleMouseDown = (event, context) => {
        updateMouseCoordinates(event, context.container);
        if (context.camera && context.raycaster) {
            context.raycaster.setFromCamera(pointer, context.camera);
        }

        const currentToolName = activeToolRef.value;
        const tool = tools[currentToolName];

        if (tool && typeof tool.onMouseDown === 'function') {
            return tool.onMouseDown({
                event,
                ...context,
                pointer
            });
        }
    };

    /**
     * Mouse Up Handler (End Drag/Paint)
     */
    const handleMouseUp = (event, context) => {
        const currentToolName = activeToolRef.value;
        const tool = tools[currentToolName];

        if (tool && typeof tool.onMouseUp === 'function') {
            return tool.onMouseUp({
                event,
                ...context,
                pointer // Last known pointer
            });
        }
    };

    return {
        handleClick,
        handleMouseMove,
        handleRightClick,
        handleDoubleClick,
        handleMouseDown,
        handleMouseUp
    };
}
