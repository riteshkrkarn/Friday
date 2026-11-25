"""Double-tap hotkey test for Windows.

Tap the RIGHT CTRL key twice quickly. The script prints a message when it
detects the double tap. Press ESC to quit.

Setup (once):   pip install pynput
Run:            python hotkey_test.py

To use a different key, change TRIGGER_KEY below. Examples:
  keyboard.Key.ctrl_r   Right Ctrl (default)
  keyboard.Key.shift_r  Right Shift
  keyboard.Key.f9       F9
"""

import time

from pynput import keyboard

TRIGGER_KEY = keyboard.Key.ctrl_r
DOUBLE_TAP_WINDOW = 0.4  # max seconds between the two taps

last_tap_time = 0.0


def on_release(key):
    global last_tap_time

    if key == keyboard.Key.esc:
        print("Quit.")
        return False  # stops the listener

    if key == TRIGGER_KEY:
        now = time.time()
        if now - last_tap_time <= DOUBLE_TAP_WINDOW:
            print("Double-tap detected! (next step: start recording)")
            last_tap_time = 0.0  # reset so a third tap starts a new cycle
        else:
            last_tap_time = now
    else:
        # Another key was pressed, so this is not a clean double tap.
        last_tap_time = 0.0


print("Tap Right Ctrl twice. Press ESC to quit.")
with keyboard.Listener(on_release=on_release) as listener:
    listener.join()