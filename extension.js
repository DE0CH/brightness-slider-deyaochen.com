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

        // read initial value
        this._readBrightness();

        // write on change
        this._handler = this.slider.connect('notify::value', () => {
            if (this._updating) return;

            const v = Math.round(this.slider.value * 100);
            const cmd = WRITE_CMD.replace('{v}', v.toString());
            GLib.spawn_command_line_async(cmd);
        });
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
        } catch (e) {
            log(e.toString());
        }
    }
    destroy() {
        if (this._handler)
            this.slider.disconnect(this._handler);
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

