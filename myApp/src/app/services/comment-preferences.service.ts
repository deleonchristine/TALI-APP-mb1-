import { Injectable, inject, signal } from '@angular/core';
import { AccountService } from './account.service';
import type { PostComment } from './post.service';

export type AuthorPreference =
  | 'muted'
  | 'restricted'
  | 'blocked';

export interface SavedComment {
  key: string;
  postId: string;
  comment: PostComment;
}

export interface CommentReport extends SavedComment {
  reason: string;
  reportedAt: string;
}

interface Preferences {
  saved: SavedComment[];
  hidden: string[];
  muted: number[];
  restricted: number[];
  blocked: number[];
  reports: CommentReport[];
}

interface CommentNotice {
  accountId: number;
  postId: string;
  text: string;
}

const empty = (): Preferences => ({
  saved: [],
  hidden: [],
  muted: [],
  restricted: [],
  blocked: [],
  reports: [],
});

const storageKey = 'tali-comment-preferences-v1';

@Injectable({ providedIn: 'root' })
export class CommentPreferencesService {
  private readonly accounts = inject(AccountService);

  private readonly records = signal<Record<string, Preferences>>(
    this.load(),
  );

  readonly notice = signal<CommentNotice | null>(null);

  get current(): Preferences {
    const id = this.accounts.selectedAccount()?.id;

    return id === undefined
      ? empty()
      : this.records()[String(id)] ?? empty();
  }

  key(postId: string, commentId: string) {
    return JSON.stringify([postId, commentId]);
  }

  visible(postId: string, comment: PostComment) {
    const prefs = this.current;

    return (
      !prefs.hidden.includes(this.key(postId, comment.id)) &&
      !prefs.muted.includes(comment.authorId) &&
      !prefs.blocked.includes(comment.authorId)
    );
  }

  restricted(authorId: number) {
    return this.current.restricted.includes(authorId);
  }

  saved(postId: string, commentId: string) {
    return this.current.saved.some(
      (item) => item.key === this.key(postId, commentId),
    );
  }

  message(postId: string, text: string) {
    const id = this.accounts.selectedAccount()?.id;
    if (id === undefined) return;

    const notification: CommentNotice = {
      accountId: id,
      postId,
      text,
    };

    this.notice.set(notification);

    setTimeout(() => {
      // An older timer must not clear a newer message.
      if (this.notice() === notification) {
        this.notice.set(null);
      }
    }, 3000);
  }

  messageFor(postId: string) {
    const item = this.notice();

    return (
      item?.accountId === this.accounts.selectedAccount()?.id &&
      item?.postId === postId
    )
      ? item.text
      : '';
  }

  toggleSaved(postId: string, comment: PostComment) {
    const key = this.key(postId, comment.id);
    const saved = this.saved(postId, comment.id);

    return this.commit(
      postId,
      {
        ...this.current,
        saved: saved
          ? this.current.saved.filter((item) => item.key !== key)
          : [
              ...this.current.saved,
              {
                key,
                postId,
                comment: { ...comment },
              },
            ],
      },
      saved
        ? 'Comment removed from saved.'
        : 'Comment saved on this device.',
    );
  }

  removeSaved(postId: string, key: string) {
    return this.commit(
      postId,
      {
        ...this.current,
        saved: this.current.saved.filter(
          (item) => item.key !== key,
        ),
      },
      'Saved comment removed.',
    );
  }

  hide(postId: string, comment: PostComment) {
    return this.commit(
      postId,
      {
        ...this.current,
        hidden: [
          ...new Set([
            ...this.current.hidden,
            this.key(postId, comment.id),
          ]),
        ],
      },
      'Comment hidden. Restore it in Saved & comment settings.',
    );
  }

  restoreHidden(postId: string, key: string) {
    return this.commit(
      postId,
      {
        ...this.current,
        hidden: this.current.hidden.filter(
          (item) => item !== key,
        ),
      },
      'Hidden comment restored.',
    );
  }

  setAuthor(
    postId: string,
    authorId: number,
    kind: AuthorPreference,
    enabled: boolean,
  ) {
    if (authorId === this.accounts.selectedAccount()?.id) {
      return false;
    }

    const ids = this.current[kind];

    const label = kind === 'restricted'
      ? 'Restricted'
      : kind === 'muted'
        ? 'Muted'
        : 'Blocked';

    return this.commit(
      postId,
      {
        ...this.current,
        [kind]: enabled
          ? [...new Set([...ids, authorId])]
          : ids.filter((id) => id !== authorId),
      },
      enabled
        ? `${label} in comments on this device. Manage this in Saved & comment settings.`
        : 'Comment preference removed.',
    );
  }

  report(
    postId: string,
    comment: PostComment,
    reason: string,
  ) {
    const key = this.key(postId, comment.id);

    if (!reason.trim()) return false;

    const report: CommentReport = {
      key,
      postId,
      comment: { ...comment },
      reason: reason.trim(),
      reportedAt: new Date().toISOString(),
    };

    return this.commit(
      postId,
      {
        ...this.current,
        reports: [
          ...this.current.reports.filter(
            (item) => item.key !== key,
          ),
          report,
        ],
      },
      'Report saved on this device. It has not been sent to an admin.',
    );
  }

  removeReport(postId: string, key: string) {
    return this.commit(
      postId,
      {
        ...this.current,
        reports: this.current.reports.filter(
          (item) => item.key !== key,
        ),
      },
      'Local report removed.',
    );
  }

  private commit(
    postId: string,
    prefs: Preferences,
    message: string,
  ): boolean {
    const id = this.accounts.selectedAccount()?.id;

    if (id === undefined) return false;

    const records = {
      ...this.records(),
      [String(id)]: prefs,
    };

    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify(records),
      );
    } catch {
      this.message(
        postId,
        'Could not save this change. Device storage may be unavailable or full.',
      );

      return false;
    }

    this.records.set(records);
    this.message(postId, message);

    return true;
  }

  private load(): Record<string, Preferences> {
    try {
      const value: unknown = JSON.parse(
        localStorage.getItem(storageKey) ?? '{}',
      );

      if (
        !value ||
        typeof value !== 'object' ||
        Array.isArray(value)
      ) {
        return {};
      }

      const result: Record<string, Preferences> = {};

      for (const [id, raw] of Object.entries(value)) {
        if (
          !/^\d+$/.test(id) ||
          !raw ||
          typeof raw !== 'object'
        ) {
          continue;
        }

        const prefs = raw as Partial<Preferences>;

        const ids = (items: unknown): number[] =>
          Array.isArray(items)
            ? items.filter(
                (item): item is number =>
                  Number.isSafeInteger(item),
              )
            : [];

        const strings = (items: unknown): string[] =>
          Array.isArray(items)
            ? items.filter(
                (item): item is string =>
                  typeof item === 'string',
              )
            : [];

        result[id] = {
          saved: Array.isArray(prefs.saved)
            ? prefs.saved.filter(validSnapshot)
            : [],
          hidden: strings(prefs.hidden),
          muted: ids(prefs.muted),
          restricted: ids(prefs.restricted),
          blocked: ids(prefs.blocked),
          reports: Array.isArray(prefs.reports)
            ? prefs.reports.filter(
                (report) =>
                  validSnapshot(report) &&
                  typeof report.reason === 'string' &&
                  typeof report.reportedAt === 'string',
              )
            : [],
        };
      }

      return result;
    } catch {
      return {};
    }
  }
}

function validSnapshot(value: unknown): value is SavedComment {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const item = value as Partial<SavedComment>;
  const comment = item.comment;

  return (
    typeof item.key === 'string' &&
    typeof item.postId === 'string' &&
    !!comment &&
    typeof comment.id === 'string' &&
    Number.isSafeInteger(comment.authorId) &&
    typeof comment.authorName === 'string' &&
    typeof comment.body === 'string'
  );
}