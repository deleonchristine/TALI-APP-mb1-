import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonIcon, IonModal } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  ellipsisHorizontal, linkOutline, bookmarkOutline,
  eyeOffOutline, volumeMuteOutline, shieldHalfOutline,
  banOutline, flagOutline, closeOutline,
} from 'ionicons/icons';

import { AccountService } from '../../services/account.service';
import { PostComment, PostService } from '../../services/post.service';
import {
  AuthorPreference, CommentPreferencesService,
} from '../../services/comment-preferences.service';

@Component({
  selector: 'app-comment-options',
  standalone: true,
  imports: [CommonModule, FormsModule, IonIcon, IonModal],
  templateUrl: './comment-options.component.html',
  styleUrls: ['./comment-options.component.scss'],
})
export class CommentOptionsComponent {
  @Input({ required: true }) postId!: string;
  @Input() comment: PostComment | null = null;
  @Input() preferences = false;

  readonly prefs = inject(CommentPreferencesService);
  readonly accounts = inject(AccountService);
  private readonly posts = inject(PostService);

  readonly kinds: AuthorPreference[] = [
    'muted', 'restricted', 'blocked',
  ];

  open = false;
  reportForm = false;
  confirmingBlock = false;
  reason = 'Spam';
  error = '';
  private actorId: number | null = null;

  constructor() {
    addIcons({
      ellipsisHorizontal, linkOutline, bookmarkOutline,
      eyeOffOutline, volumeMuteOutline, shieldHalfOutline,
      banOutline, flagOutline, closeOutline,
    });
  }

  get modalOpen() {
    return this.open &&
      this.actorId === (this.accounts.selectedAccount()?.id ?? null);
  }

  get ownComment() {
    return this.comment?.authorId === this.accounts.selectedAccount()?.id;
  }

  get isPostOwner() {
    const id = this.accounts.selectedAccount()?.id;

    return id !== undefined && this.posts.posts().some(
      (post) => post.id === this.postId && post.authorId === id,
    );
  }

  get ownerHidden() {
    return this.availableComment?.hiddenByPostOwner === true;
  }

  get isSaved() {
    return !!this.comment && this.prefs.saved(this.postId, this.comment.id);
  }

  get availableComment(): PostComment | null {
    const post = this.posts.posts().find((item) => item.id === this.postId);

    if (!post || !this.posts.canViewPost(
      post,
      this.accounts.selectedAccount(),
      this.accounts.accounts(),
    )) return null;

    return this.posts.visibleCommentsFor(
      post,
      this.accounts.selectedAccount()?.id ?? null,
    ).find((item) => item.id === this.comment?.id) ?? null;
  }

  show(event: MouseEvent) {
    event.stopPropagation();
    this.actorId = this.accounts.selectedAccount()?.id ?? null;
    this.error = '';
    this.reportForm = false;
    this.confirmingBlock = false;
    this.open = true;
  }

  close() {
    this.open = false;
    this.reportForm = false;
    this.confirmingBlock = false;
  }

  private canChange(): boolean {
    if (!this.modalOpen) return false;

    if (!this.accounts.selectedAccount()) {
      this.error = 'Select an account first.';
      return false;
    }

    if (!this.preferences && !this.availableComment) {
      this.error = 'This comment is no longer available.';
      return false;
    }

    return true;
  }

  private finish(success: boolean) {
    if (success) {
      this.close();
    } else {
      this.error = this.prefs.messageFor(this.postId) ||
        'Could not save this change.';
    }
  }

  toggleOwnerHidden() {
    if (!this.canChange() || !this.isPostOwner) return;

    const comment = this.availableComment;
    const account = this.accounts.selectedAccount();

    if (!comment || !account) return;

    const hidden = !comment.hiddenByPostOwner;

    if (this.posts.setCommentHidden(
      this.postId, comment.id, account.id, hidden,
    )) {
      this.prefs.message(
        this.postId,
        hidden
          ? 'Comment hidden from other viewers.'
          : 'Comment is visible again.',
      );
      this.close();
    } else {
      this.error = 'Could not change comment visibility.';
    }
  }

  save() {
    if (!this.canChange() || !this.availableComment) return;
    this.finish(this.prefs.toggleSaved(this.postId, this.availableComment));
  }

  hide() {
    if (!this.canChange() || !this.availableComment) return;
    this.finish(this.prefs.hide(this.postId, this.availableComment));
  }

  authorAction(kind: AuthorPreference) {
    if (
      !this.canChange() ||
      !this.availableComment ||
      this.ownComment
    ) return;

    const id = this.availableComment.authorId;
    const enabled = this.prefs.current[kind].includes(id);

    if (kind === 'blocked' && !enabled && !this.confirmingBlock) {
      this.confirmingBlock = true;
      return;
    }

    this.finish(this.prefs.setAuthor(this.postId, id, kind, !enabled));
  }

  beginReport() {
    if (this.canChange() && !this.ownComment) {
      this.reportForm = true;
    }
  }

  submitReport() {
    if (
      !this.canChange() ||
      !this.availableComment ||
      this.ownComment
    ) return;

    this.finish(this.prefs.report(
      this.postId, this.availableComment, this.reason,
    ));
  }

  async copy() {
    const comment = this.availableComment;

    if (!comment) {
      this.error = 'This comment is unavailable.';
      return;
    }

    const url = new URL('/home', window.location.origin);
    url.hash = `post-${this.postId}`;

    try {
      await navigator.clipboard.writeText(
        `${comment.authorName}: ${comment.body}\n${url.toString()}`,
      );

      if (!this.modalOpen) return;
      this.prefs.message(this.postId, 'Comment and post link copied.');
      this.close();
    } catch {
      this.error = 'Could not copy. Clipboard access may be unavailable.';
    }
  }

  authorName(id: number) {
    return this.accounts.accounts().find(
      (account) => account.id === id,
    )?.name ?? `Account ${id}`;
  }

  hiddenLabel(key: string) {
    try {
      const [postId, commentId] = JSON.parse(key);
      const comment = this.posts.posts()
        .find((post) => post.id === postId)
        ?.comments.find((item) => item.id === commentId);

      return comment ? `Comment by ${comment.authorName}` : 'Hidden comment';
    } catch {
      return 'Hidden comment';
    }
  }

  removeSaved(key: string) {
    if (this.canChange()) this.prefs.removeSaved(this.postId, key);
  }

  restore(key: string) {
    if (this.canChange()) this.prefs.restoreHidden(this.postId, key);
  }

  removeAuthor(id: number, kind: AuthorPreference) {
    if (this.canChange()) this.prefs.setAuthor(this.postId, id, kind, false);
  }

  removeReport(key: string) {
    if (this.canChange()) this.prefs.removeReport(this.postId, key);
  }
}