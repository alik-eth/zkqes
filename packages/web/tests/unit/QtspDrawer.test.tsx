// Unit tests for QtspDrawer — right-edge slide-in panel for non-live
// QTSP tiles. Plan §T8 + lead's three heads-ups:
//
//   1. "Help us verify" link points at a GitHub issue template that
//      doesn't land until T16. Test the URL mechanics (template name +
//      qtsp slug fragment), NOT a real navigation. Stub window.open.
//
//   2. "Notify me" localStorage key follows the existing `zkqes.<feat>.<id>`
//      shape (`zkqes.cliBanner.dismissed`, `zkqes.qtsp.demo.*`).
//      Plan §T8 specifies `zkqes.qtsp.notify.<cc>/<slug>` — kept verbatim.
//
//   3. Focus management — when drawer closes, focus returns to the
//      invocation element. The drawer accepts a `previouslyFocusedRef`
//      pointer; on close it calls `.focus()` on the captured element.
//
// react-i18next is mocked at module level per the existing CliBanner /
// QtspTile convention.

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { QtspMeta } from '@zkqes/sdk';
import { QtspDrawer, NOTIFY_STORAGE_PREFIX } from '../../src/components/qtsp/QtspDrawer';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const baseMeta: QtspMeta = {
  country: 'IT',
  qtspSlug: 'aruba-pec',
  displayName: 'Aruba PEC',
  qtspUrl: 'https://www.pec.it/',
  tslEntry: null,
  signingTool: {
    name: 'ArubaSign',
    url: 'https://www.pec.it/firma-digitale.aspx',
    minVersion: null,
  },
  state: 'bronze',
  addedAt: '2026-05-05',
  promotedAt: null,
  lastVerified: '2026-05-05',
  notes: 'Italian QTSP — paper-trail only, no parser yet.',
  // V5.4 — required QtspMeta fields. The QtspDrawer rendering doesn't
  // exercise DOB extraction; using canonical Diia-UA values to satisfy
  // the cross-field invariant.
  dobEncoding: 'diia-ua',
  dobAttributeOid: '1.2.804.2.1.1.1.11.1.4.11.1',
};

beforeEach(() => {
  globalThis.localStorage?.clear();
});
afterEach(() => {
  cleanup();
});

describe('QtspDrawer', () => {
  it('renders header strip — displayName, flag, state badge', () => {
    render(<QtspDrawer meta={baseMeta} open onClose={vi.fn()} />);
    expect(screen.getByText('Aruba PEC')).toBeInTheDocument();
    expect(screen.getByLabelText('Italy')).toBeInTheDocument();
    expect(screen.getByText('qtsp.state.bronze')).toBeInTheDocument();
  });

  it('renders meta.notes inside the about section', () => {
    render(<QtspDrawer meta={baseMeta} open onClose={vi.fn()} />);
    expect(
      screen.getByText('Italian QTSP — paper-trail only, no parser yet.'),
    ).toBeInTheDocument();
  });

  it('does not render when open=false', () => {
    render(<QtspDrawer meta={baseMeta} open={false} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('"Help us verify" opens GitHub issue with template + qtsp fragment via window.open', () => {
    const openSpy = vi
      .spyOn(globalThis, 'open')
      .mockImplementation(() => null);
    render(<QtspDrawer meta={baseMeta} open onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('qtsp.drawer.helpVerify'));
    expect(openSpy).toHaveBeenCalledTimes(1);
    const [url, target] = openSpy.mock.calls[0]!;
    expect(target).toBe('_blank');
    expect(typeof url).toBe('string');
    expect(url as string).toMatch(
      /github\.com\/.+\/issues\/new\?template=help-add-qtsp\.md/,
    );
    // qtsp fragment must carry both country and slug, lower-case path
    // shape (matches the GitHub issue template's expected `qtsp` field).
    expect(url as string).toContain('qtsp=it%2Faruba-pec');
    openSpy.mockRestore();
  });

  it('"Notify me" form writes to localStorage under the canonical zkqes.qtsp.notify key', () => {
    render(<QtspDrawer meta={baseMeta} open onClose={vi.fn()} />);
    const input = screen.getByLabelText(/email/i);
    fireEvent.change(input, { target: { value: 'user@example.com' } });
    fireEvent.click(screen.getByText('qtsp.drawer.notifyMe'));
    const key = `${NOTIFY_STORAGE_PREFIX}IT/aruba-pec`;
    const stored = globalThis.localStorage.getItem(key);
    expect(stored).not.toBeNull();
    // Stored shape is JSON with email + timestamp so we can later notify
    // the user without losing when-they-asked context.
    const parsed = JSON.parse(stored!);
    expect(parsed.email).toBe('user@example.com');
    expect(typeof parsed.requestedAt).toBe('string');
  });

  it('storage prefix follows the zkqes.<feature>.<id> namespace convention', () => {
    // Frozen-shape guard — drift here would split notify-list reads
    // between the drawer and any downstream "list pending notifies"
    // tooling (T16+).
    expect(NOTIFY_STORAGE_PREFIX).toBe('zkqes.qtsp.notify.');
  });

  it('Esc and overlay click both invoke onClose', () => {
    const onClose = vi.fn();
    render(<QtspDrawer meta={baseMeta} open onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('qtsp-drawer-overlay'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('restores focus to the captured trigger element when drawer unmounts', () => {
    // Set up a real button in the document to simulate the tile that
    // opened the drawer; the drawer captures it via `previouslyFocusedRef`.
    const trigger = document.createElement('button');
    trigger.textContent = 'tile';
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const ref = { current: trigger };
    const { rerender } = render(
      <QtspDrawer
        meta={baseMeta}
        open
        onClose={vi.fn()}
        previouslyFocusedRef={ref}
      />,
    );
    // Drawer takes focus while open — it doesn't matter exactly which
    // child, just that focus has left the trigger.
    expect(document.activeElement).not.toBe(trigger);
    // Close the drawer; focus must return to the trigger.
    rerender(
      <QtspDrawer
        meta={baseMeta}
        open={false}
        onClose={vi.fn()}
        previouslyFocusedRef={ref}
      />,
    );
    expect(document.activeElement).toBe(trigger);

    document.body.removeChild(trigger);
  });
});
