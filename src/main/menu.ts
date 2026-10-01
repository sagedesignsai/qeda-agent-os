import {
  clipboard,
  Menu,
  shell,
  BrowserWindow,
  MenuItemConstructorOptions,
} from 'electron';
import { navigateTo } from './os-integration';

/**
 * Renderer routes surfaced in the Go menu and via Cmd/Ctrl+1..8 accelerators,
 * in sidebar order. Keyboard-driven navigation is what makes the app feel at
 * home on the desktop; the list must stay in sync with renderer/routes.tsx.
 */
const NAV_TARGETS: { label: string; path: string }[] = [
  { label: 'Agent Chat', path: '/chat' },
  { label: 'Tasks & Focus', path: '/tasks' },
  { label: 'Projects', path: '/projects' },
  { label: 'Workspace', path: '/workspace' },
  { label: 'Terminal', path: '/terminal' },
  { label: 'Documents', path: '/documents' },
  { label: 'Studio', path: '/studio' },
  { label: 'Tools', path: '/tools' },
];

export default class MenuBuilder {
  mainWindow: BrowserWindow;

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
  }

  buildMenu(): Menu {
    const template =
      process.platform === 'darwin'
        ? this.buildDarwinTemplate()
        : this.buildDefaultTemplate();

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);

    return menu;
  }

  buildGoSubmenu(): MenuItemConstructorOptions[] {
    return NAV_TARGETS.map(({ label, path }, index) => ({
      label,
      accelerator: `CmdOrCtrl+${index + 1}`,
      click: () => navigateTo(this.mainWindow, path),
    }));
  }

  buildDarwinTemplate(): MenuItemConstructorOptions[] {
    const subMenuAbout: MenuItemConstructorOptions = { role: 'appMenu' };
    const subMenuEdit: MenuItemConstructorOptions = { role: 'editMenu' };
    const subMenuGo: MenuItemConstructorOptions = {
      label: 'Go',
      submenu: this.buildGoSubmenu(),
    };
    const subMenuWindow: MenuItemConstructorOptions = { role: 'windowMenu' };
    const subMenuView: MenuItemConstructorOptions = {
      label: 'View',
      submenu: this.buildViewTemplate(),
    };
    const subMenuHelp: MenuItemConstructorOptions = {
      label: 'Help',
      submenu: [
        {
          label: 'Learn More',
          click() {
            shell.openExternal('https://electronjs.org');
          },
        },
        {
          label: 'Documentation',
          click() {
            shell.openExternal(
              'https://github.com/electron/electron/tree/main/docs#readme',
            );
          },
        },
        {
          label: 'Community Discussions',
          click() {
            shell.openExternal('https://www.electronjs.org/community');
          },
        },
        {
          label: 'Search Issues',
          click() {
            shell.openExternal('https://github.com/electron/electron/issues');
          },
        },
      ],
    };

    return [
      subMenuAbout,
      subMenuEdit,
      subMenuGo,
      subMenuView,
      subMenuWindow,
      subMenuHelp,
    ];
  }

  buildViewTemplate(): MenuItemConstructorOptions[] {
    const development =
      process.env.NODE_ENV === 'development' ||
      process.env.DEBUG_PROD === 'true';
    return [
      ...(development
        ? ([
            { role: 'reload' },
            { role: 'toggleDevTools' },
          ] as MenuItemConstructorOptions[])
        : []),
      { role: 'togglefullscreen' },
    ];
  }

  buildDefaultTemplate(): MenuItemConstructorOptions[] {
    const templateDefault: MenuItemConstructorOptions[] = [
      {
        label: '&File',
        submenu: [
          {
            label: '&New Task…',
            accelerator: 'CmdOrCtrl+N',
            click: () => navigateTo(this.mainWindow, '/tasks?capture=1'),
          },
          { type: 'separator' },
          { role: 'close' },
        ],
      },
      { role: 'editMenu' },
      {
        label: '&Go',
        submenu: this.buildGoSubmenu(),
      },
      {
        label: '&View',
        submenu: this.buildViewTemplate(),
      },
      {
        label: 'Help',
        submenu: [
          {
            label: 'Learn More',
            click() {
              shell.openExternal('https://electronjs.org');
            },
          },
          {
            label: 'Documentation',
            click() {
              shell.openExternal(
                'https://github.com/electron/electron/tree/main/docs#readme',
              );
            },
          },
          {
            label: 'Community Discussions',
            click() {
              shell.openExternal('https://www.electronjs.org/community');
            },
          },
          {
            label: 'Search Issues',
            click() {
              shell.openExternal('https://github.com/electron/electron/issues');
            },
          },
        ],
      },
    ];

    return templateDefault;
  }
}

/**
 * Production right-click menu. Without this, right-clicking in the shipped
 * app does nothing — no copy/paste on selections, no spelling suggestions,
 * no link actions. Fires alongside the spellchecker (main.ts enables it);
 * `dictionarySuggestions` is only populated for misspelled editable text.
 */
export function attachContentContextMenu(mainWindow: BrowserWindow): void {
  const development =
    process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

  mainWindow.webContents.on('context-menu', (_event, props) => {
    const items: MenuItemConstructorOptions[] = [];

    if (props.misspelledWord && props.dictionarySuggestions.length > 0) {
      for (const suggestion of props.dictionarySuggestions.slice(0, 4)) {
        items.push({
          label: suggestion,
          click: () => mainWindow.webContents.replaceMisspelling(suggestion),
        });
      }
      items.push({ type: 'separator' });
    }

    if (props.linkURL) {
      items.push(
        {
          label: 'Open Link',
          click: () => shell.openExternal(props.linkURL),
        },
        {
          label: 'Copy Link Address',
          click: () => clipboard.writeText(props.linkURL),
        },
        { type: 'separator' },
      );
    }

    if (props.isEditable) {
      items.push(
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      );
    } else if (props.selectionText.trim()) {
      items.push({ role: 'copy' });
    }

    if (development) {
      if (items.length > 0) items.push({ type: 'separator' });
      items.push({
        label: 'Inspect Element',
        click: () => mainWindow.webContents.inspectElement(props.x, props.y),
      });
    }

    if (items.length > 0) {
      Menu.buildFromTemplate(items).popup({ window: mainWindow });
    }
  });
}
