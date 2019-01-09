import Config = require('cordova-config');
import * as et from 'elementtree';

interface Element {
    find(query : string) : Element;
    findall(query : string) : Array<Element>;
    remove(el : Element);
    append(Element);
    attrib: {}
}

export class CordovaConfig extends Config {
    _absoluteRoot : Element;
    _root : Element;
    _doc : Element;
    selectPlatform(name) {
        this._absoluteRoot = this._root;
        this._root = this._root.find(`./platform/[@name="${name}"]`);
    }
    selectRoot() {
        this._root = this._absoluteRoot || this._root;
        this._absoluteRoot = this._root;
    }
    removeAll(query) {
        this._doc.findall(`./${query}`).forEach(tag => this._root.remove(tag));
    }
    removeIcons() {
        this.removeAll('icon');
    }
    removeScreens() {
        this.removeAll('splash');
    }
    addIcon(attrs = {}) {
        return this.addElement('icon', '', attrs);
    }
    addScreen(attrs = {}) {
        return this.addElement('splash', '', attrs);
    }
    addAllowNavigation(href) {
        return this.addElement('allow-navigation', '', { href });
    }
    addElement(tagName, content, attribs = {}) {
        const el = new et.Element(tagName);
        this._root.append(el);

        if (typeof content === 'object') {
            el.append(content);
        } else {
            el.text = content || '';
        }

        el.attrib = {};
        el.attrib = Object.assign({}, attribs);
    }
    setWidgetAttribute(name, value) {
        this._root.attrib[name] = value;
    }
    addEditConfig(file, target, mode, contents) {
        this.addElement('edit-config', et.XML(contents), { file, mode, target });
    }
}