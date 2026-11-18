// Keyboard and mouse input. Held keys are a live set; one-shot presses (enter a car,
// reload, pause, mute) are edge flags taken once by the loop, so a press between two
// frames is never lost and never counted twice. The mouse steers the camera: pointer
// lock when it is available, drag-to-look as the fallback (and in headless browsers).

export const ACTION_ENTER = 1;
export const ACTION_RELOAD = 2;
export const ACTION_PAUSE = 4;
export const ACTION_MUTE = 8;
export const ACTION_CONFIRM = 16;

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.actions = 0;
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseDown = false;
    this.mouseClicked = false;
    this.pointerLocked = false;
    this.dragging = false;
    this.lastX = 0;
    this.lastY = 0;

    window.addEventListener('keydown', (event) => {
      if (event.repeat) return;
      this.keys.add(event.code);
      this.pressed.add(event.code);
      if (event.code === 'KeyE') this.actions |= ACTION_ENTER;
      else if (event.code === 'KeyR') this.actions |= ACTION_RELOAD;
      else if (event.code === 'Escape' || event.code === 'KeyP') this.actions |= ACTION_PAUSE;
      else if (event.code === 'KeyM') this.actions |= ACTION_MUTE;
      else if (event.code === 'Space' || event.code === 'Enter') this.actions |= ACTION_CONFIRM;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
        event.preventDefault();
      }
    });
    window.addEventListener('keyup', (event) => {
      this.keys.delete(event.code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
    });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === canvas;
    });
    document.addEventListener('mousemove', (event) => {
      if (this.pointerLocked) {
        this.mouseDX += event.movementX;
        this.mouseDY += event.movementY;
      } else if (this.dragging) {
        this.mouseDX += event.clientX - this.lastX;
        this.mouseDY += event.clientY - this.lastY;
        this.lastX = event.clientX;
        this.lastY = event.clientY;
      }
    });
    canvas.addEventListener('mousedown', (event) => {
      this.mouseDown = true;
      this.mouseClicked = true;
      this.dragging = true;
      this.lastX = event.clientX;
      this.lastY = event.clientY;
      if (document.pointerLockElement !== canvas && canvas.requestPointerLock) {
        try {
          canvas.requestPointerLock();
        } catch {
          // Pointer lock is a nicety; drag-to-look still works without it.
        }
      }
    });
    window.addEventListener('mouseup', () => {
      this.mouseDown = false;
      this.dragging = false;
    });
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  isDown(code) {
    return this.keys.has(code);
  }

  /** True once for the frame the key went down, then false until it is pressed again. */
  wasPressed(code) {
    return this.pressed.has(code);
  }

  /** -1/0/1 for the A/D or arrow keys. */
  steer() {
    const left = this.isDown('KeyA') || this.isDown('ArrowLeft');
    const right = this.isDown('KeyD') || this.isDown('ArrowRight');
    return (right ? 1 : 0) - (left ? 1 : 0);
  }

  /** -1/0/1 for the W/S or arrow keys (forward/back). */
  throttle() {
    const fwd = this.isDown('KeyW') || this.isDown('ArrowUp');
    const back = this.isDown('KeyS') || this.isDown('ArrowDown');
    return (fwd ? 1 : 0) - (back ? 1 : 0);
  }

  /** True while Shift is held (run on foot). */
  running() {
    return this.isDown('ShiftLeft') || this.isDown('ShiftRight');
  }

  /** Mouse look delta since the last take, in pixels. */
  takeMouse() {
    const dx = this.mouseDX;
    const dy = this.mouseDY;
    this.mouseDX = 0;
    this.mouseDY = 0;
    return { dx, dy };
  }

  /** True once for the frame the mouse button went down (fire). */
  takeClick() {
    const clicked = this.mouseClicked;
    this.mouseClicked = false;
    return clicked;
  }

  /** One-shot action flags since the last call. */
  takeActions() {
    const taken = this.actions;
    this.actions = 0;
    return taken;
  }

  /** Clear the per-frame edge sets at the end of a frame. */
  endFrame() {
    this.pressed.clear();
  }

  releasePointerLock() {
    if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  }
}
