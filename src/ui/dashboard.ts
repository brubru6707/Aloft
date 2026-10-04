/**
 * Projects dashboard: a full-screen overlay listing saved projects as cards (thumbnail,
 * name, piece count, last edit) with Open / Rename / Delete, plus "Save current" and
 * "New project". No browser dialogs: renaming is inline, deleting asks on the button.
 */
import type { ProjectSummary } from '../projects';

export interface DashboardActions {
  list(): ProjectSummary[];
  currentId(): string | null;
  open(id: string): void;
  rename(id: string, name: string): void;
  remove(id: string): void;
  saveAs(name: string): void;
  newProject(): void;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

function ago(t: number): string {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString();
}

export class Dashboard {
  private root: HTMLElement;
  private grid: HTMLElement;
  private nameInput: HTMLInputElement;
  private confirmDelete: string | null = null;

  constructor(parent: HTMLElement, private actions: DashboardActions) {
    this.root = document.createElement('div');
    this.root.id = 'dashboard';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="dash panel" role="dialog" aria-label="Projects">
        <header>
          <h1>Projects</h1>
          <button class="close" title="Back to the scene (Esc)">✕</button>
        </header>
        <form class="save-row">
          <input class="name" type="text" placeholder="Name this build…" maxlength="60" autocomplete="off" />
          <button type="submit" class="save">💾 Save current as new</button>
          <button type="button" class="new">＋ New empty project</button>
        </form>
        <div class="grid"></div>
      </div>`;
    parent.appendChild(this.root);
    this.grid = this.root.querySelector('.grid')!;
    this.nameInput = this.root.querySelector('.name')!;
    this.root.querySelector<HTMLButtonElement>('.close')!.onclick = () => this.hide();
    this.root.querySelector<HTMLFormElement>('.save-row')!.onsubmit = (e) => {
      e.preventDefault();
      this.actions.saveAs(this.nameInput.value.trim() || `Build ${new Date().toLocaleString()}`);
      this.nameInput.value = '';
      this.render();
    };
    this.root.querySelector<HTMLButtonElement>('.new')!.onclick = () => { this.actions.newProject(); this.hide(); };
    // Click on the dimmed backdrop closes; Esc closes.
    this.root.addEventListener('mousedown', (e) => { if (e.target === this.root) this.hide(); });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !this.root.hidden) this.hide(); });
  }

  get visible(): boolean { return !this.root.hidden; }
  show(): void { this.confirmDelete = null; this.render(); this.root.hidden = false; }
  hide(): void { this.root.hidden = true; }
  toggle(): void { if (this.visible) this.hide(); else this.show(); }

  render(): void {
    const projects = this.actions.list();
    const current = this.actions.currentId();
    if (!projects.length) {
      this.grid.innerHTML = `<p class="empty">No saved projects yet. Build something, give it a name above and press Save.</p>`;
      return;
    }
    this.grid.innerHTML = projects.map((p) => `
      <article class="card${p.id === current ? ' current' : ''}" data-id="${p.id}">
        <div class="thumb">${p.thumbnail ? `<img src="${p.thumbnail}" alt="" />` : '<span>no preview</span>'}</div>
        <div class="meta">
          <input class="title" value="${esc(p.name)}" title="Click to rename" maxlength="60" />
          <span class="sub">${p.pieceCount} piece${p.pieceCount === 1 ? '' : 's'} · ${ago(p.updatedAt)}${p.id === current ? ' · open now' : ''}</span>
        </div>
        <div class="buttons">
          <button class="open">${p.id === current ? 'Continue' : 'Open'}</button>
          <button class="del">${this.confirmDelete === p.id ? 'Sure? Delete' : 'Delete'}</button>
        </div>
      </article>`).join('');
    this.grid.querySelectorAll<HTMLElement>('.card').forEach((card) => {
      const id = card.dataset.id!;
      card.querySelector<HTMLButtonElement>('.open')!.onclick = () => { this.actions.open(id); this.hide(); };
      card.querySelector<HTMLElement>('.thumb')!.onclick = () => { this.actions.open(id); this.hide(); };
      const del = card.querySelector<HTMLButtonElement>('.del')!;
      del.onclick = () => {
        if (this.confirmDelete === id) { this.actions.remove(id); this.confirmDelete = null; }
        else this.confirmDelete = id;
        this.render();
      };
      const title = card.querySelector<HTMLInputElement>('.title')!;
      const commit = () => { if (title.value.trim() && title.value.trim() !== title.defaultValue) this.actions.rename(id, title.value.trim()); };
      title.onkeydown = (e) => { if (e.key === 'Enter') title.blur(); if (e.key === 'Escape') { title.value = title.defaultValue; title.blur(); e.stopPropagation(); } };
      title.onblur = commit;
    });
  }
}
