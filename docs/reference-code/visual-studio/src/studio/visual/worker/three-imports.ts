/**
 * Single re-export of Three.js so all worker files import from one place.
 * This ensures consistent version usage and simplifies tree-shaking.
 */
import * as THREE from "three"
export { THREE }
