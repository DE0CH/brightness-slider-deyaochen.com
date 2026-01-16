"use strict";

import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import * as QuickSettings from 'resource:///org/gnome/shell/ui/quickSettings.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

const QuickMenu = Main.panel.statusArea.quickSettings;

// CHANGE IF NEEDED
const WRITE_CMD = 'ddccontrol -r 0x10 -w {v} dev:/dev/i2c-23';
const READ_CMD  = 'ddccontrol -r 0x10 dev:/dev/i2c-23';

const Slider = GObject.registerClass(
class Slider extends QuickSettings.QuickSlider {
    _init() {
        super._init({ iconName: 'display-brightness-symbolic' });

        this.slider.accessible_name = 'External Brightness';
        this._updating = false;
        this._bufferedValue = null;
        this._timeoutId = null;
        this._inactivityTimeoutId = null;

        // read initial value
        this._readBrightness();

        // write on change: update buffer; start periodic sender and reset inactivity timer
        this._handler = this.slider.connect('notify::value', () => {
            if (this._updating) return;

            const v = Math.round(this.slider.value * 100);
            this._bufferedValue = v;

            // start periodic sender if not running
            if (!this._timeoutId) {
                this._sendBufferedValue();
                this._timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
                    try {
                        this._sendBufferedValue();
                    } catch (e) {
                        log(e.toString());
                    }
                    return true; // continue repeating
                });
            }

            // reset inactivity timer: stop periodic sender after 2s of no moves
            if (this._inactivityTimeoutId) {
                GLib.source_remove(this._inactivityTimeoutId);
                this._inactivityTimeoutId = null;
            }
            this._inactivityTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {
                if (this._timeoutId) {
                    GLib.source_remove(this._timeoutId);
                    this._timeoutId = null;
                }
                this._inactivityTimeoutId = null;
                return false; // do not repeat
            });
        });
    }
    _sendBufferedValue() {
        try {
            if (this._bufferedValue !== null) {
                const cmd = WRITE_CMD.replace('{v}', this._bufferedValue.toString());
                GLib.spawn_command_line_async(cmd);
            }
        } catch (e) {
            log(e.toString());
        }
    }
    _readBrightness() {
        try {
            const [ok, out] = GLib.spawn_command_line_sync(READ_CMD);
            if (!ok) return;
    
            const lines = out.toString().trim().split('\n');
            const last = lines[lines.length - 1];
    
            // Parse: Control 0x10: +/8/100 C [Brightness]
            const m = last.match(/Control 0x10:\s+\+\/(\d+)\/(\d+)/);
            if (!m) return;
    
            const value = parseInt(m[1], 10);
            const max = parseInt(m[2], 10);
    
            this._updating = true;
            this.slider.value = value / max;
            this._updating = false;
            this._bufferedValue = Math.round(this.slider.value * 100);
        } catch (e) {
            log(e.toString());
        }
    }
    destroy() {
        if (this._handler)
            this.slider.disconnect(this._handler);
        if (this._timeoutId)
            GLib.source_remove(this._timeoutId);
        if (this._inactivityTimeoutId)
            GLib.source_remove(this._inactivityTimeoutId);
        super.destroy();
    }
});

export default class MinimalExtension extends Extension {
    enable() {
        this._ind = new QuickSettings.SystemIndicator();
        this._ind.quickSettingsItems.push(new Slider());
        QuickMenu.addExternalIndicator(this._ind, 2);
    }

    disable() {
        this._ind.quickSettingsItems.forEach(i => i.destroy());
        this._ind.destroy();
        this._ind = null;
    }
}

