import Mustache from 'mustache';
import { marked } from 'marked';
// import DOMPurify from 'dompurify';

export type RenderMode = 'markdown' | 'html';

export class TemplateService {
  render(opts: {
    template: string;
    mode: RenderMode;
    data: any;
  }): string {
    const raw = Mustache.render(opts.template, opts.data);

    if (opts.mode === 'html') {
      // ⚠️ sanitiza si viene de Appwrite
      return escapeHtml(raw);
    }

    // markdown -> html
    return marked.parse(raw) as string;
  }
}

function escapeHtml(s: string) {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
      })[c] as string,
  );
}
