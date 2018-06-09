import { MissingArgumentError } from './errors';
import { last } from './utils';

export enum XmlNodeType {
    Text = "Text",
    General = "General"
}

export type XmlNode = XmlTextNode | XmlGeneralNode;

export interface XmlNodeBase {
    nodeType: XmlNodeType;
    nodeName: string;
    parentNode?: XmlNode;
    childNodes?: XmlNode[];
    nextSibling?: XmlNode;
}

const TEXT_NODE_NAME_VALUE = '#text'; // see: https://developer.mozilla.org/en-US/docs/Web/API/Node/nodeName

export interface XmlTextNode extends XmlNodeBase {
    nodeType: XmlNodeType.Text;
    nodeName: typeof TEXT_NODE_NAME_VALUE;
    textContent: string;
}

export interface XmlGeneralNode extends XmlNodeBase {
    nodeType: XmlNodeType.General;
    attributes?: XmlAttribute[];
}

export interface XmlAttribute {
    name: string;
    value: string;
}

// tslint:disable-next-line:no-namespace
export namespace XmlNode {

    //
    // constants
    //

    export const TEXT_NODE_NAME = TEXT_NODE_NAME_VALUE;

    //
    // factories
    //

    export function createTextNode(text?: string): XmlTextNode {
        return {
            nodeType: XmlNodeType.Text,
            nodeName: XmlNode.TEXT_NODE_NAME,
            textContent: text
        };
    }

    export function createGeneralNode(name: string): XmlGeneralNode {
        return {
            nodeType: XmlNodeType.General,
            nodeName: name
        };
    }

    //
    // serialization
    //

    /**
     * Encode string to make it safe to use inside xml tags.
     * 
     * https://stackoverflow.com/questions/7918868/how-to-escape-xml-entities-in-javascript
     */
    export function encodeValue(str: string): string {
        if (str === null || str === undefined)
            throw new MissingArgumentError(nameof(str));
        if (typeof str !== 'string')
            throw new TypeError(`Expected a string, got '${(str as any).constructor.name}'.`);

        return str.replace(/[<>&'"]/g, c => {
            switch (c) {
                case '<': return '&lt;';
                case '>': return '&gt;';
                case '&': return '&amp;';
                case '\'': return '&apos;';
                case '"': return '&quot;';
            }
            return '';
        });
    }

    export function serialize(node: XmlNode): string {
        if (isTextNode(node))
            return encodeValue(node.textContent) || '';

        // attributes
        let attributes = '';
        if (node.attributes && node.attributes.length) {
            attributes = ' ' + node.attributes
                .map(attr => `${attr.name}="${attr.value}"`)
                .join(' ');
        }

        // open tag
        const hasChildren = (node.childNodes || []).length > 0;
        const suffix = hasChildren ? '' : '/';
        const openTag = `<${node.nodeName}${attributes}${suffix}>`;

        let xml: string;

        if (hasChildren) {

            // child nodes
            const childrenXml = node.childNodes
                .map(child => serialize(child))
                .join('');

            // close tag
            const closeTag = `</${node.nodeName}>`;

            xml = openTag + childrenXml + closeTag;
        } else {
            xml = openTag;
        }

        return xml;
    }

    /**
     * The conversion is always deep.
     */
    export function fromDomNode(domNode: Node): XmlNode {
        let xmlNode: XmlNode;

        // basic properties
        if (domNode.nodeType === domNode.TEXT_NODE) {

            xmlNode = createTextNode(domNode.textContent);

        } else {

            xmlNode = createGeneralNode(domNode.nodeName);

            // attributes
            if (domNode.nodeType === domNode.ELEMENT_NODE) {
                const attributes = (domNode as Element).attributes;
                if (attributes) {
                    (xmlNode as XmlGeneralNode).attributes = [];
                    for (let i = 0; i < attributes.length; i++) {
                        const curAttribute = attributes.item(i);
                        (xmlNode as XmlGeneralNode).attributes.push({
                            name: curAttribute.name,
                            value: curAttribute.value
                        });
                    }
                }
            }
        }

        // children
        if (domNode.childNodes) {
            xmlNode.childNodes = [];
            let prevChild: XmlNode;
            for (let i = 0; i < domNode.childNodes.length; i++) {

                // clone child
                const domChild = domNode.childNodes.item(i);
                const curChild = fromDomNode(domChild);

                // set references                
                xmlNode.childNodes.push(curChild);
                curChild.parentNode = xmlNode;
                if (prevChild) {
                    prevChild.nextSibling = curChild;
                }
                prevChild = curChild;
            }
        }

        return xmlNode as XmlNode;
    }

    //
    // core functions
    //

    export function isTextNode(node: XmlNode): node is XmlTextNode {
        if (node.nodeType === XmlNodeType.Text || node.nodeName === TEXT_NODE_NAME) {
            if (!(node.nodeType === XmlNodeType.Text && node.nodeName === TEXT_NODE_NAME)) {
                throw new Error(`Invalid text node. Type: '${node.nodeType}', Name: '${node.nodeName}'.`);
            }
            return true;
        }
        return false;
    }

    export function cloneNode(node: XmlNode, deep: boolean): XmlNode {
        if (!node)
            throw new MissingArgumentError(nameof(node));

        if (!deep) {
            const clone = Object.assign({}, node);
            clone.parentNode = null;
            clone.childNodes = null;
            clone.nextSibling = null;
            return clone;
        } else {
            const clone = cloneNodeDeep(node);
            clone.parentNode = null;
            return clone;
        }
    }

    /**
     * Insert the node as a new sibling, before the original node.
     *
     * * **Note**: It is more efficient to use the insertChild function if you
     *   already know the relevant index.
     */
    export function insertBefore(newNode: XmlNode, referenceNode: XmlNode): void {
        if (!newNode)
            throw new MissingArgumentError(nameof(newNode));
        if (!referenceNode)
            throw new MissingArgumentError(nameof(referenceNode));

        if (!referenceNode.parentNode)
            throw new Error(`'${nameof(referenceNode)}' has no parent`);

        const childNodes = referenceNode.parentNode.childNodes;
        const beforeNodeIndex = childNodes.indexOf(referenceNode);
        XmlNode.insertChild(referenceNode.parentNode, newNode, beforeNodeIndex);
    }

    export function insertChild(parent: XmlNode, child: XmlNode, childIndex: number): void {
        if (!parent)
            throw new MissingArgumentError(nameof(parent));
        if (isTextNode(parent))
            throw new Error('Appending children to text nodes is forbidden');
        if (!child)
            throw new MissingArgumentError(nameof(child));

        if (!parent.childNodes)
            parent.childNodes = [];

        // revert to append
        if (childIndex === parent.childNodes.length) {
            XmlNode.appendChild(parent, child);
            return;
        }

        if (childIndex > parent.childNodes.length)
            throw new RangeError(`Child index ${childIndex} is out of range. Parent has only ${parent.childNodes.length} child nodes.`);

        // update references
        child.parentNode = parent;

        const childAfter = parent.childNodes[childIndex];
        child.nextSibling = childAfter;

        if (childIndex > 0) {
            const childBefore = parent.childNodes[childIndex - 1];
            childBefore.nextSibling = child;
        }

        // append
        parent.childNodes.splice(childIndex, 0, child);
    }

    export function appendChild(parent: XmlNode, child: XmlNode): void {
        if (!parent)
            throw new MissingArgumentError(nameof(parent));
        if (isTextNode(parent))
            throw new Error('Appending children to text nodes is forbidden');
        if (!child)
            throw new MissingArgumentError(nameof(child));

        if (!parent.childNodes)
            parent.childNodes = [];

        // update references
        if (parent.childNodes.length) {
            const currentLastChild = parent.childNodes[parent.childNodes.length - 1];
            currentLastChild.nextSibling = child;
        }
        child.nextSibling = null;
        child.parentNode = parent;

        // append
        parent.childNodes.push(child);
    }        

    /**
     * Removes the node from it's parent.
     * 
     * * **Note**: It is more efficient to call removeChild(parent, childIndex).
     */
    export function remove(node: XmlNode): void {
        if (!node)
            throw new MissingArgumentError(nameof(node));

        if (!node.parentNode)
            throw new Error('Node has no parent');

        removeChild(node.parentNode, node);
    }

    /**
     * * **Note:** Prefer calling with explicit index.
     */
    export function removeChild(parent: XmlNode, child: XmlNode): XmlNode;
    export function removeChild(parent: XmlNode, childIndex: number): XmlNode;
    export function removeChild(parent: XmlNode, childOrIndex: XmlNode | number): XmlNode {
        if (!parent)
            throw new MissingArgumentError(nameof(parent));
        if (childOrIndex === null || childOrIndex === undefined)
            throw new MissingArgumentError(nameof(childOrIndex));

        if (!parent.childNodes || !parent.childNodes.length)
            throw new Error('Parent node has node children');

        // get child index
        let childIndex: number;
        if (typeof childOrIndex === 'number') {
            childIndex = childOrIndex;
        } else {
            childIndex = parent.childNodes.indexOf(childOrIndex);
            if (childIndex === -1)
                throw new Error('Specified child node is not a child of the specified parent');
        }

        if (childIndex >= parent.childNodes.length)
            throw new RangeError(`Child index ${childIndex} is out of range. Parent has only ${parent.childNodes.length} child nodes.`);

        // update references
        const child = parent.childNodes[childIndex];
        if (childIndex > 0) {
            const beforeChild = parent.childNodes[childIndex - 1];
            beforeChild.nextSibling = child.nextSibling;
        }
        child.parentNode = null;
        child.nextSibling = null;

        // remove and return
        return parent.childNodes.splice(childIndex, 1)[0];
    }        

    //
    // utility functions
    //    

    /**
     * Gets the last direct child text node if it exists. Otherwise creates a
     * new text node, appends it to 'node' and return the newly created text
     * node.
     *
     * The function also makes sure the returned text node has a valid string
     * value.
     */
    export function lastTextChild(node: XmlNode): XmlTextNode {
        if (isTextNode(node)) {
            return node;
        }

        // existing text nodes
        if (node.childNodes) {
            const allTextNodes = node.childNodes.filter(child => isTextNode(child)) as XmlTextNode[];
            if (allTextNodes.length) {
                const lastTextNode = last(allTextNodes);
                if (!lastTextNode.textContent)
                    lastTextNode.textContent = '';
                return lastTextNode;
            }
        }

        // create new text node
        const newTextNode: XmlTextNode = {
            nodeType: XmlNodeType.Text,
            nodeName: TEXT_NODE_NAME,
            textContent: ''
        };

        appendChild(node, newTextNode);
        return newTextNode;
    }

    /**
     * Remove sibling nodes between 'from' and 'to' excluding both.
     * Return the removed nodes.
     */
    export function removeSiblings(from: XmlNode, to: XmlNode): XmlNode[] {
        if (from === to)
            return [];

        const removed: XmlNode[] = [];

        from = from.nextSibling;
        while (from !== to) {
            const removeMe = from;
            from = from.nextSibling;

            XmlNode.remove(removeMe);
            removed.push(removeMe);
        }

        return removed;
    }

    /**
     * Modifies the original node and returns the other part.
     *
     * @param root The node to split
     * @param markerNode The node that marks the split position. 
     * @param afterMarker If true everything the marker node will be extracted
     * into the result node. Else, everything before it will be extracted
     * instead.
     */
    export function splitByChild(root: XmlNode, markerNode: XmlNode, afterMarker: boolean, removeMarkerNode: boolean): XmlNode {
        const path = getDescendantPath(root, markerNode);

        let clone = XmlNode.cloneNode(root, false);

        const childIndex = path[0] + (afterMarker ? 1 : -1);
        if (afterMarker) {

            // after marker
            while (childIndex < root.childNodes.length) {
                const curChild = root.childNodes[childIndex];
                XmlNode.remove(curChild);
                XmlNode.appendChild(clone, curChild);
            }

            if (removeMarkerNode) {
                XmlNode.remove(last(root.childNodes));
            }
        } else {

            // before marker
            const stopChild = root.childNodes[childIndex];
            let curChild: XmlNode;
            do {
                curChild = root.childNodes[0];
                XmlNode.remove(curChild);
                XmlNode.appendChild(clone, curChild);

            } while (curChild !== stopChild);

            if (removeMarkerNode) {
                XmlNode.remove(root.childNodes[0]);
            }
        }

        return clone;
    }

    //
    // private functions
    //

    function cloneNodeDeep(original: XmlNode): XmlNode {

        const clone: XmlNode = ({} as any);

        // basic properties
        clone.nodeType = original.nodeType;
        clone.nodeName = original.nodeName;
        if (isTextNode(original)) {
            (clone as XmlTextNode).textContent = original.textContent;
        } else {
            const attributes = original.attributes;
            if (attributes) {
                (clone as XmlGeneralNode).attributes = attributes.map(attr => ({ name: attr.name, value: attr.value }));
            }
        }

        // children
        if (original.childNodes) {
            clone.childNodes = [];
            let prevChildClone: XmlNode;
            for (const child of original.childNodes) {

                // clone child
                const childClone = cloneNodeDeep(child);

                // set references                
                clone.childNodes.push(childClone);
                childClone.parentNode = clone;
                if (prevChildClone) {
                    prevChildClone.nextSibling = childClone;
                }
                prevChildClone = childClone;
            }
        }

        return clone;
    }

    function getDescendantPath(root: XmlNode, descendant: XmlNode): number[] {
        const path: number[] = [];

        let node = descendant;
        while (node !== root) {
            const parent = node.parentNode;
            if (!parent)
                throw new Error(`Argument ${nameof(descendant)} is not a descendant of ${nameof(root)}`);

            const curChildIndex = parent.childNodes.indexOf(node);
            path.push(curChildIndex);

            node = parent;
        }

        return path.reverse();
    }
}