import {
  Component, inject, Input, OnChanges, SimpleChanges, ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonButton, IonContent, IonIcon, IonTextarea, ModalController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  chevronBackOutline, chevronForwardOutline, closeOutline,
  personCircleOutline, heart, heartOutline, chatbubbleOutline,
  repeatOutline, shareOutline, sendOutline,
} from 'ionicons/icons';

import { AccountService } from '../../services/account.service';
import {
  Post, PostAttachment, PostComment, PostService,
} from '../../services/post.service';
import {
  CommentPreferencesService,
} from '../../services/comment-preferences.service';
import {
  CommentOptionsComponent,
} from '../../components/comment-options/comment-options.component';

interface CommentDraft {
  commentDraft: string;
  selectedMediaIndex: number;
  replyToId: string | null;
}

interface CommentRow {
  comment: PostComment;
  reply: boolean;
  hasReplies: boolean;
  last: boolean;
}

@Component({
  selector: 'app-comments',
  standalone: true,
  templateUrl: './comments.page.html',
  styleUrls: ['./comments.page.scss'],
  imports: [
    CommonModule, FormsModule, IonButton, IonContent,
    IonIcon, IonTextarea, CommentOptionsComponent,
  ],
})
export class CommentsPage implements OnChanges {
  @Input({ required: true }) postId!: string;
  @ViewChild(IonTextarea) composer?: IonTextarea;

  readonly accountService = inject(AccountService);
  readonly commentPrefs = inject(CommentPreferencesService);
  private readonly postService = inject(PostService);
  private readonly modalController = inject(ModalController);
  private readonly revealed = new Set<string>();

  sortBy = 'relevant';
  commentDraft = '';
  commentError = '';
  actionMessage = '';
  selectedMediaIndex = 0;
  replyToId: string | null = null;

  constructor() {
    addIcons({
      chevronBackOutline, chevronForwardOutline, closeOutline,
      personCircleOutline, heart, heartOutline, chatbubbleOutline,
      repeatOutline, shareOutline, sendOutline,
    });
  }

  ngOnChanges(changes: SimpleChanges) {
    if (!changes['postId'] || !this.postId) return;
    const saved = this.readDraft();
    this.commentDraft = saved?.commentDraft ?? '';
    this.selectedMediaIndex = saved?.selectedMediaIndex ?? 0;
    this.replyToId = saved?.replyToId ?? null;
    this.commentError = '';
    this.actionMessage = '';
  }

  private get draftKey(): string {
    return `tali-comment-draft:${this.postId}`;
  }

  saveDraft() {
    try {
      sessionStorage.setItem(this.draftKey, JSON.stringify({
        commentDraft: this.commentDraft,
        selectedMediaIndex: this.selectedMediaIndex,
        replyToId: this.replyToId,
      }));
    } catch {
      // Keep the composer usable without storage.
    }
  }

  private readDraft(): CommentDraft | null {
    try {
      const value = JSON.parse(
        sessionStorage.getItem(this.draftKey) ?? 'null',
      ) as Partial<CommentDraft> | null;

      if (!value || typeof value.commentDraft !== 'string') return null;

      return {
        commentDraft: value.commentDraft,
        selectedMediaIndex:
          typeof value.selectedMediaIndex === 'number' &&
          Number.isInteger(value.selectedMediaIndex) &&
          value.selectedMediaIndex >= 0
            ? value.selectedMediaIndex : 0,
        replyToId: typeof value.replyToId === 'string'
          ? value.replyToId : null,
      };
    } catch {
      return null;
    }
  }

  get post(): Post | null {
    const post = this.postService.posts().find(
      (item) => item.id === this.postId,
    );
    if (!post) return null;

    return this.postService.canViewPost(
      post,
      this.accountService.selectedAccount(),
      this.accountService.accounts(),
    ) ? post : null;
  }

  get commentsEnabled(): boolean {
    return this.readSetting('commentsEnabled', true);
  }

  get sharingEnabled(): boolean {
    return this.readSetting('sharingEnabled', true);
  }

  get hideLikeCounts(): boolean {
    return this.readSetting('hideLikeCounts', false);
  }

  get hideShareCounts(): boolean {
    return this.readSetting('hideShareCounts', false);
  }

  private readSetting(key: string, fallback: boolean): boolean {
    if (typeof localStorage === 'undefined') return fallback;
    const stored = localStorage.getItem(`tali-setting-${key}`);
    return stored === null ? fallback : stored === 'true';
  }

  get visibleComments(): PostComment[] {
    const post = this.post;

    let comments = (post
      ? this.postService.visibleCommentsFor(
          post,
          this.accountService.selectedAccount()?.id ?? null,
        )
      : []
    ).filter((comment) => this.commentPrefs.visible(this.postId, comment));

    if (
      this.readSetting('hiddenWordsEnabled', false) &&
      typeof localStorage !== 'undefined'
    ) {
      const words = (localStorage.getItem('tali-hidden-words') ?? '')
        .split(',')
        .map((word) => word.trim().toLowerCase())
        .filter(Boolean);

      comments = comments.filter((comment) =>
        !words.some((word) => comment.body.toLowerCase().includes(word)),
      );
    }

    return comments;
  }

  get selectedAccountImage(): string | undefined {
    return this.accountService.selectedAccount()?.profileImage;
  }

  relativeTime(value: Date): string {
    const elapsed = Date.now() - new Date(value).getTime();
    if (!Number.isFinite(elapsed)) return '';
    const minutes = Math.max(0, Math.floor(elapsed / 60000));
    if (minutes < 1) return 'now';
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;
    if (days < 365) return `${Math.floor(days / 7)}w`;
    return `${Math.floor(days / 365)}y`;
  }

  get threadedComments(): CommentRow[] {
    const comments = this.visibleComments;
    const ids = new Set(comments.map((comment) => comment.id));
    const children = new Map<string, PostComment[]>();

    for (const comment of comments) {
      const parentId = comment.parentCommentId;

      if (parentId && parentId !== comment.id && ids.has(parentId)) {
        const list = children.get(parentId) ?? [];
        list.push(comment);
        children.set(parentId, list);
      }
    }

    const byTime = (first: PostComment, second: PostComment): number =>
      new Date(first.createdAt).getTime() -
      new Date(second.createdAt).getTime();

    const roots = comments.filter((comment) =>
      !comment.parentCommentId ||
      comment.parentCommentId === comment.id ||
      !ids.has(comment.parentCommentId),
    );

    roots.sort((first, second) => {
      if (this.sortBy === 'oldest') return byTime(first, second);
      if (this.sortBy === 'newest') return byTime(second, first);

      return (second.likes?.length ?? 0) -
        (first.likes?.length ?? 0) || byTime(second, first);
    });

    const visited = new Set<string>();
    const result: CommentRow[] = [];

    const append = (root: PostComment) => {
      const group: PostComment[] = [];
      const stack: PostComment[] = [root];

      while (stack.length > 0) {
        const comment = stack.pop()!;
        if (visited.has(comment.id)) continue;

        visited.add(comment.id);
        group.push(comment);

        const replies = [...(children.get(comment.id) ?? [])].sort(byTime);

        for (let index = replies.length - 1; index >= 0; index--) {
          stack.push(replies[index]);
        }
      }

      group.forEach((comment, index) => {
        result.push({
          comment,
          reply: index > 0,
          hasReplies: index === 0 && group.length > 1,
          last: index === group.length - 1,
        });
      });
    };

    roots.forEach(append);
    comments.filter((comment) => !visited.has(comment.id)).forEach(append);
    return result;
  }

  get replyTarget(): PostComment | null {
    return this.visibleComments.find(
      (comment) => comment.id === this.replyToId,
    ) ?? null;
  }

  replyParent(comment: PostComment): PostComment | null {
    return this.visibleComments.find(
      (item) => item.id === comment.parentCommentId,
    ) ?? null;
  }

  get mediaAttachments(): PostAttachment[] {
    return this.post?.attachments.filter((attachment) =>
      attachment.type.startsWith('image/') ||
      attachment.type.startsWith('video/'),
    ) ?? [];
  }

  get selectedMedia(): PostAttachment | null {
    const media = this.mediaAttachments;
    if (!media.length) return null;

    const index = Math.max(
      0,
      Math.min(this.selectedMediaIndex, media.length - 1),
    );

    return media[index];
  }

  get authorImage(): string | undefined {
    const author = this.accountService.accounts().find(
      (account) => account.id === this.post?.authorId,
    );

    return author && this.accountService.canViewProfileImage(
      author, this.accountService.selectedAccount(),
    ) ? author.profileImage : undefined;
  }

  commentAuthorImage(authorId: number): string | undefined {
    const author = this.accountService.accounts().find(
      (account) => account.id === authorId,
    );

    return author && this.accountService.canViewProfileImage(
      author, this.accountService.selectedAccount(),
    ) ? author.profileImage : undefined;
  }

  moveMedia(direction: number) {
    const count = this.mediaAttachments.length;
    if (!count) return;

    this.selectedMediaIndex =
      (this.selectedMediaIndex + direction + count) % count;
    this.saveDraft();
  }

  close() {
    void this.modalController.dismiss();
  }

  isCollapsed(comment: PostComment): boolean {
    const key =
      `${this.accountService.selectedAccount()?.id}:` +
      `${this.postId}:${comment.id}`;

    return this.commentPrefs.restricted(comment.authorId) &&
      !this.revealed.has(key);
  }

  reveal(comment: PostComment) {
    const key =
      `${this.accountService.selectedAccount()?.id}:` +
      `${this.postId}:${comment.id}`;
    this.revealed.add(key);
  }

  liked(comment: PostComment): boolean {
    const id = this.accountService.selectedAccount()?.id;
    return id !== undefined && (comment.likes ?? []).includes(id);
  }

  reposted(comment: PostComment): boolean {
    const id = this.accountService.selectedAccount()?.id;
    return id !== undefined && (comment.reposts ?? []).includes(id);
  }

  replyCount(comment: PostComment): number {
    return this.visibleComments.filter(
      (item) => item.parentCommentId === comment.id,
    ).length;
  }

  private actor() {
    const account = this.accountService.selectedAccount();

    if (!account) {
      this.actionMessage = 'Select an account to interact with comments.';
    }

    return account;
  }

  like(comment: PostComment) {
    const account = this.actor();
    if (!account) return;
    this.postService.toggleCommentLike(this.postId, comment.id, account.id);
  }

  repost(comment: PostComment) {
    if (!this.sharingEnabled) return;
    const account = this.actor();
    if (!account) return;
    this.postService.toggleCommentRepost(this.postId, comment.id, account.id);
  }

  reply(comment: PostComment) {
    if (!this.commentsEnabled || !this.actor()) return;
    this.replyToId = comment.id;
    this.saveDraft();
    void this.composer?.setFocus();
  }

  cancelReply() {
    this.replyToId = null;
    this.saveDraft();
  }

  async share(comment: PostComment) {
    if (!this.sharingEnabled) return;
    const account = this.actor();
    if (!account) return;

    const url = new URL('/home', window.location.origin);
    url.hash = `post-${this.postId}`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: `${comment.authorName} on Tali`,
          text: comment.body,
          url: url.toString(),
        });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(
          `${comment.authorName}: ${comment.body}\n${url.toString()}`,
        );
        this.actionMessage = 'Comment and post link copied.';
      } else {
        this.actionMessage = 'Sharing is unavailable in this browser.';
        return;
      }

      if (this.accountService.selectedAccount()?.id === account.id) {
        this.postService.recordCommentShare(
          this.postId, comment.id, account.id,
        );
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        this.actionMessage = 'Could not share this comment.';
      }
    }
  }

  submitComment() {
    if (!this.commentsEnabled) {
      this.commentError = 'Comments are turned off for this account.';
      return;
    }

    const account = this.accountService.selectedAccount();
    const post = this.post;
    const body = this.commentDraft.trim();

    if (!post || !body) return;

    if (!account) {
      this.commentError = 'Select an account to comment.';
      return;
    }

    if (this.replyToId && !this.replyTarget) {
      this.commentError =
        'The reply target is unavailable. Cancel the reply to post a new comment.';
      return;
    }

    const added = this.postService.addComment(
      post.id,
      account,
      body,
      this.accountService.accounts(),
      this.replyToId,
    );

    if (!added) {
      this.commentError = 'Could not post this comment.';
      return;
    }

    this.commentDraft = '';
    this.replyToId = null;
    this.commentError = '';
    this.saveDraft();
  }
}