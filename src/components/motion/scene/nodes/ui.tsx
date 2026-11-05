/**
 * components/motion/scene/nodes/ui.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Software-showcase bindings. Browser chrome, the code card and callouts are all
 * flat card geometry plus SDF text, which keeps them crisp at any framing and
 * lets the export renderer produce them without a DOM overlay. The browser frame
 * deliberately renders no content of its own: a `screen.image` child mounts in
 * front of the backing plane, exactly like a device screen.
 */

import { Text } from '@react-three/drei';

import type { MotionNode } from '@/lib/motion/types';

import { boolProp, numberProp, roundedRectangle, stringProp } from './helpers';

/** Troika only preloads the glyphs it is told about; code needs the full set. */
const CODE_GLYPHS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 {}[]()<>=+-*/%.,:;!?'\"`|&$_@#~^\\";

const UI_GLYPHS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,!? '()-:&%·—/";

function cardGeometry(width: number, height: number, cornerRadius: number) {
  return roundedRectangle(width, height, Math.min(cornerRadius, width / 2, height / 2));
}

export function BrowserRenderer({ node }: { node: MotionNode }) {
  const width = numberProp(node, 'width', 4.6);
  const height = numberProp(node, 'height', 2.75);
  const depth = numberProp(node, 'depth', 0.12);
  const cornerRadius = numberProp(node, 'cornerRadius', 0.09);
  const chromeHeight = numberProp(node, 'chromeHeight', 0.34);
  const label = stringProp(node, 'label', 'Studio — Overview');
  const url = stringProp(node, 'url', 'qeda.app/studio');
  const color = stringProp(node, 'color', '#0e131c');
  const chromeColor = stringProp(node, 'chromeColor', '#1b2230');
  const accent = stringProp(node, 'accentColor', '#5885f7');

  const inset = Math.min(0.14, width * 0.03);
  const contentWidth = Math.max(0.1, width - inset * 2);
  const contentHeight = Math.max(0.1, height - chromeHeight - inset * 2);
  const chromeY = height / 2 - chromeHeight / 2;
  const face = depth / 2 + 0.002;

  const tabWidth = Math.min(width * 0.3, 1.35);
  const tabX = -width / 2 + 0.66 + tabWidth / 2;
  const addressLeft = tabX + tabWidth / 2 + 0.12;
  const addressRight = width / 2 - 0.16;
  const addressWidth = Math.max(0.2, addressRight - addressLeft);

  return (
    <group>
      <mesh position={[0, 0, -depth / 2]} castShadow receiveShadow>
        <extrudeGeometry
          args={[cardGeometry(width, height, cornerRadius), { depth, bevelEnabled: false, curveSegments: 10 }]}
        />
        <meshStandardMaterial color={color} roughness={0.42} metalness={0.18} />
      </mesh>

      <mesh position={[0, chromeY, face]}>
        <shapeGeometry args={[cardGeometry(width, chromeHeight, cornerRadius * 0.6)]} />
        <meshBasicMaterial color={chromeColor} />
      </mesh>

      <mesh position={[0, -chromeHeight / 2, face + 0.001]}>
        <planeGeometry args={[contentWidth, contentHeight]} />
        <meshBasicMaterial color="#05070c" />
      </mesh>

      {[0, 1, 2].map((index) => (
        <mesh key={index} position={[-width / 2 + 0.2 + index * 0.15, chromeY, face + 0.004]}>
          <circleGeometry args={[0.036, 20]} />
          <meshBasicMaterial color={['#ff5f57', '#febc2e', '#28c840'][index]} />
        </mesh>
      ))}

      <mesh position={[tabX, chromeY, face + 0.003]}>
        <shapeGeometry args={[cardGeometry(tabWidth, chromeHeight * 0.62, 0.06)]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh position={[tabX, chromeY, face + 0.005]}>
        <circleGeometry args={[0.022, 12]} />
        <meshBasicMaterial color={accent} />
      </mesh>
      <Text
        position={[tabX + 0.07, chromeY, face + 0.006]}
        fontSize={chromeHeight * 0.24}
        color="#dfe6f2"
        anchorX="left"
        anchorY="middle"
        maxWidth={tabWidth - 0.2}
        textAlign="left"
        characters={UI_GLYPHS}
      >
        {label}
      </Text>

      <mesh position={[addressLeft + addressWidth / 2, chromeY, face + 0.003]}>
        <shapeGeometry args={[cardGeometry(addressWidth, chromeHeight * 0.56, chromeHeight * 0.28)]} />
        <meshBasicMaterial color="#0b1017" />
      </mesh>
      <Text
        position={[addressLeft + 0.1, chromeY, face + 0.006]}
        fontSize={chromeHeight * 0.22}
        color="#8794a8"
        anchorX="left"
        anchorY="middle"
        maxWidth={addressWidth - 0.2}
        textAlign="left"
        characters={UI_GLYPHS}
      >
        {url}
      </Text>
    </group>
  );
}

export function CodeCardRenderer({ node }: { node: MotionNode }) {
  const width = numberProp(node, 'width', 2.4);
  const height = numberProp(node, 'height', 1.5);
  const depth = numberProp(node, 'depth', 0.05);
  const title = stringProp(node, 'title', 'hero.tsx');
  const language = stringProp(node, 'language', 'TSX');
  const code = stringProp(node, 'code', '');
  const fontSize = numberProp(node, 'fontSize', 0.072);
  const lineHeight = numberProp(node, 'lineHeight', 1.5);
  const showLineNumbers = boolProp(node, 'showLineNumbers', true);
  const background = stringProp(node, 'background', '#0c1119');
  const color = stringProp(node, 'color', '#c9d4e3');
  const accent = stringProp(node, 'accentColor', '#5885f7');

  const padX = width * 0.06;
  const titleHeight = Math.max(fontSize * 2.6, 0.18);
  const step = fontSize * lineHeight;
  const gutter = showLineNumbers ? fontSize * 2.1 : 0;
  const contentTop = height / 2 - titleHeight - step * 0.65;
  const bottom = -height / 2 + step * 0.7;
  const maxLines = Math.max(1, Math.floor((contentTop - bottom) / step) + 1);
  const lines = code.split('\n').slice(0, maxLines);
  const face = depth / 2 + 0.002;
  const codeX = -width / 2 + padX + gutter;
  const maxTextWidth = width - padX * 2 - gutter;

  return (
    <group>
      <mesh position={[0, 0, -depth / 2]} castShadow receiveShadow>
        <extrudeGeometry
          args={[cardGeometry(width, height, 0.06), { depth, bevelEnabled: false, curveSegments: 8 }]}
        />
        <meshStandardMaterial color={background} roughness={0.5} metalness={0.12} />
      </mesh>

      <mesh position={[0, height / 2 - titleHeight / 2, face]}>
        <planeGeometry args={[width, titleHeight]} />
        <meshBasicMaterial color="#111823" />
      </mesh>

      {[0, 1, 2].map((index) => (
        <mesh key={index} position={[-width / 2 + padX + index * fontSize * 1.35, height / 2 - titleHeight / 2, face + 0.003]}>
          <circleGeometry args={[fontSize * 0.32, 16]} />
          <meshBasicMaterial color={['#ff5f57', '#febc2e', '#28c840'][index]} />
        </mesh>
      ))}

      <Text
        position={[-width / 2 + padX + fontSize * 4.6, height / 2 - titleHeight / 2, face + 0.004]}
        fontSize={fontSize * 0.95}
        color="#9aa7ba"
        anchorX="left"
        anchorY="middle"
        maxWidth={width * 0.5}
        textAlign="left"
        characters={CODE_GLYPHS}
      >
        {title}
      </Text>

      <Text
        position={[width / 2 - padX, height / 2 - titleHeight / 2, face + 0.004]}
        fontSize={fontSize * 0.8}
        color={accent}
        anchorX="right"
        anchorY="middle"
        characters={CODE_GLYPHS}
      >
        {language}
      </Text>

      {lines.map((line, index) => {
        const y = contentTop - index * step;
        return (
          <group key={index}>
            {showLineNumbers && (
              <Text
                position={[-width / 2 + padX + gutter * 0.55, y, face + 0.003]}
                fontSize={fontSize * 0.85}
                color="#5b6678"
                anchorX="right"
                anchorY="middle"
                characters="0123456789"
              >
                {String(index + 1)}
              </Text>
            )}
            <Text
              position={[codeX, y, face + 0.003]}
              fontSize={fontSize}
              color={color}
              anchorX="left"
              anchorY="middle"
              maxWidth={maxTextWidth}
              textAlign="left"
              characters={CODE_GLYPHS}
            >
              {line || ' '}
            </Text>
          </group>
        );
      })}
    </group>
  );
}

export function AnnotationRenderer({ node }: { node: MotionNode }) {
  const width = numberProp(node, 'width', 2.2);
  const height = numberProp(node, 'height', 1);
  const title = stringProp(node, 'title', 'Instant preview');
  const body = stringProp(node, 'body', 'Every edit renders on the next frame.');
  const accent = stringProp(node, 'accentColor', '#59c7a6');
  const background = stringProp(node, 'background', '#101722');
  const color = stringProp(node, 'color', '#e8eef8');
  const align = stringProp(node, 'align', 'left') === 'center' ? 'center' : 'left';

  const padX = width * 0.08;
  const titleSize = Math.min(height * 0.17, width * 0.085);
  const bodySize = titleSize * 0.66;
  const textX = align === 'center' ? 0 : -width / 2 + padX;
  const maxTextWidth = width - padX * 2;

  return (
    <group>
      <mesh position={[0, 0, -0.02]} castShadow receiveShadow>
        <extrudeGeometry
          args={[cardGeometry(width, height, Math.min(0.08, height * 0.12)), { depth: 0.04, bevelEnabled: false, curveSegments: 8 }]}
        />
        <meshStandardMaterial color={background} roughness={0.55} metalness={0.08} />
      </mesh>
      <mesh position={[-width / 2 + 0.035, 0, 0.003]}>
        <planeGeometry args={[0.055, height * 0.82]} />
        <meshBasicMaterial color={accent} toneMapped={false} />
      </mesh>
      <Text
        position={[textX, height * 0.16, 0.006]}
        fontSize={titleSize}
        color={color}
        anchorX={align === 'center' ? 'center' : 'left'}
        anchorY="middle"
        maxWidth={maxTextWidth}
        textAlign={align}
        characters={UI_GLYPHS}
      >
        {title}
      </Text>
      <Text
        position={[textX, -height * 0.16, 0.006]}
        fontSize={bodySize}
        color="#9aa7bd"
        anchorX={align === 'center' ? 'center' : 'left'}
        anchorY="middle"
        maxWidth={maxTextWidth}
        textAlign={align}
        characters={UI_GLYPHS}
      >
        {body}
      </Text>
    </group>
  );
}

const TERMINAL_GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 {}[]()<>=+-*/%.,:;!?'\"`|&$_@#~^/\\";

export function TerminalRenderer({ node }: { node: MotionNode }) {
  const width = numberProp(node, 'width', 3.6);
  const height = numberProp(node, 'height', 2.2);
  const title = stringProp(node, 'title', 'terminal');
  const lines = (node.props.lines as string[]) ?? [];
  const fontSize = numberProp(node, 'fontSize', 0.085);
  const bg = stringProp(node, 'background', '#0b1017');
  const color = stringProp(node, 'color', '#c9d4e3');
  const accent = stringProp(node, 'accentColor', '#59c7a6');
  const opacity = numberProp(node, 'opacity', 1);
  const padX = width * 0.04;
  const titleH = Math.max(fontSize * 2.4, 0.18);
  const step = fontSize * 1.35;
  const contentTop = height / 2 - titleH - step * 0.5;
  const maxLines = Math.max(1, Math.floor((contentTop + height / 2) / step));
  const visible = lines.slice(0, maxLines);
  return (
    <group>
      <mesh position={[0, 0, -0.02]} castShadow receiveShadow>
        <boxGeometry args={[width, height, 0.06]} />
        <meshStandardMaterial color={bg} roughness={0.6} metalness={0.1} transparent={opacity < 1} opacity={opacity} />
      </mesh>
      <mesh position={[0, height / 2 - titleH / 2, 0.031]}>
        <planeGeometry args={[width, titleH]} />
        <meshBasicMaterial color="#111823" transparent opacity={opacity} toneMapped={false} />
      </mesh>
      <Text position={[-width / 2 + padX, height / 2 - titleH / 2, 0.033]} fontSize={fontSize * 0.9} color="#9aa7ba" anchorX="left" anchorY="middle" characters={TERMINAL_GLYPHS}>{title}</Text>
      {visible.map((line, i) => (
        <Text key={i} position={[-width / 2 + padX, contentTop - i * step, 0.033]} fontSize={fontSize} color={color} anchorX="left" anchorY="middle" characters={TERMINAL_GLYPHS}>{line || ' '}</Text>
      ))}
      <mesh position={[-width / 2 + padX + visible.length * 0 + 0, contentTop - visible.length * step, 0.033]}>
        <planeGeometry args={[fontSize * 0.6, fontSize * 1.1]} />
        <meshBasicMaterial color={accent} toneMapped={false} />
      </mesh>
    </group>
  );
}

export function ChatRenderer({ node }: { node: MotionNode }) {
  const width = numberProp(node, 'width', 3.2);
  const messages = (node.props.messages as Array<{ role: string; text: string }>) ?? [];
  const fontSize = numberProp(node, 'fontSize', 0.1);
  const userColor = stringProp(node, 'userColor', '#5885f7');
  const assistantColor = stringProp(node, 'assistantColor', '#1b2230');
  const bg = stringProp(node, 'background', '#0e131c');
  const opacity = numberProp(node, 'opacity', 1);
  const pad = 0.12;
  const bubbleH = fontSize * 2.6;
  const gap = 0.12;
  let y = 0;
  const items = messages.map((m, i) => {
    const isUser = m.role === 'user';
    const w = Math.min(width - pad * 2, Math.max(0.6, m.text.length * fontSize * 0.55 + pad));
    const x = isUser ? width / 2 - w / 2 - pad : -width / 2 + w / 2 + pad;
    const item = { m, isUser, w, x, y: 0 };
    y -= bubbleH + gap;
    return item;
  });
  // top-align
  const totalH = items.length * (bubbleH + gap);
  items.forEach((it, i) => { it.y = totalH / 2 - i * (bubbleH + gap) - bubbleH / 2; });
  return (
    <group>
      <mesh position={[0, 0, -0.02]}>
        <boxGeometry args={[width, Math.max(1, totalH + pad * 2), 0.06]} />
        <meshStandardMaterial color={bg} roughness={0.6} metalness={0.1} transparent={opacity < 1} opacity={opacity} />
      </mesh>
      {items.map((it, i) => (
        <group key={i} position={[it.x, it.y, 0.031]}>
          <mesh>
            <planeGeometry args={[it.w, bubbleH]} />
            <meshBasicMaterial color={it.isUser ? userColor : assistantColor} transparent opacity={opacity} toneMapped={false} />
          </mesh>
          <Text fontSize={fontSize} color="#ffffff" anchorX="center" anchorY="middle" characters="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,!? '()-:&%·—/">
            {it.m.text}
          </Text>
        </group>
      ))}
    </group>
  );
}

export function CursorRenderer({ node }: { node: MotionNode }) {
  const size = numberProp(node, 'size', 0.35);
  const color = stringProp(node, 'color', '#ffffff');
  const label = stringProp(node, 'label', '');
  const opacity = numberProp(node, 'opacity', 1);
  return (
    <group>
      <mesh position={[0, 0, 0]}>
        <coneGeometry args={[size * 0.25, size, 3]} />
        <meshBasicMaterial color={color} transparent opacity={opacity} toneMapped={false} />
      </mesh>
      {label && (
        <Text position={[size * 0.6, -size * 0.4, 0]} fontSize={size * 0.4} color={color} anchorX="left" anchorY="middle" characters="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,!? '()-:&%·—/">
          {label}
        </Text>
      )}
    </group>
  );
}

export function NotificationRenderer({ node }: { node: MotionNode }) {
  const title = stringProp(node, 'title', 'Saved');
  const body = stringProp(node, 'body', 'Your changes are live.');
  const width = numberProp(node, 'width', 2.6);
  const height = numberProp(node, 'height', 0.7);
  const accent = stringProp(node, 'accentColor', '#59c7a6');
  const bg = stringProp(node, 'background', '#101722');
  const color = stringProp(node, 'color', '#e8eef8');
  const opacity = numberProp(node, 'opacity', 1);
  return (
    <group>
      <mesh>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial color={bg} roughness={0.5} metalness={0.08} transparent={opacity < 1} opacity={opacity} />
      </mesh>
      <mesh position={[-width / 2 + 0.06, 0, 0.002]}>
        <planeGeometry args={[0.04, height * 0.7]} />
        <meshBasicMaterial color={accent} toneMapped={false} />
      </mesh>
      <Text position={[-width / 2 + 0.16, height * 0.15, 0.003]} fontSize={height * 0.22} color={color} anchorX="left" anchorY="middle" characters="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,!? '()-:&%·—/">{title}</Text>
      <Text position={[-width / 2 + 0.16, -height * 0.15, 0.003]} fontSize={height * 0.18} color="#9aa7bd" anchorX="left" anchorY="middle" characters="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,!? '()-:&%·—/">{body}</Text>
    </group>
  );
}
