import {
  Component, ElementRef, HostListener, inject, Input,
  OnChanges, SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { IonIcon, IonModal } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  addOutline, addCircleOutline, removeCircleOutline, personOutline,
  chatbubbleOutline, chevronBackOutline, chevronForwardOutline,
  documentOutline, ellipsisHorizontal, heart, heartOutline,
  personCircleOutline, repeatOutline, shareOutline,
} from 'ionicons/icons';
import { AccountService } from '../../services/account.service';
import { Post, PostComment, PostService } from '../../services/post.service';
import { CommentsPage } from '../../pages/comments/comments.page';

@Component({
  selector: 'app-post-card',
  standalone: true,
  templateUrl: './post-card.component.html',
  styleUrls: ['./post-card.component.scss'],
  imports: [CommonModule, RouterLink, IonIcon, IonModal, CommentsPage],
})
export class PostCardComponent implements OnChanges {
  @Input({ required: true }) post!: Post;
  @Input() focusPostOnLoad = false;
  @Input() openCommentsOnLoad = false;
  @Input() focusRequestId = '';
  @Input() showCommentPreview = false;

  readonly accountService = inject(AccountService);
  private readonly postService = inject(PostService);
  private readonly hostElement = inject(ElementRef<HTMLElement>);

  commentsOpen = false;
  actionMessage = '';
  showMoreOptions = false;
  showAuthorOptions = false;
  editingPost = false;
  editBody = '';

  constructor() {
    addIcons({
      addOutline, addCircleOutline, removeCircleOutline, personOutline,
      chatbubbleOutline, chevronBackOutline, chevronForwardOutline,
      documentOutline, ellipsisHorizontal, heart, heartOutline,
      personCircleOutline, repeatOutline, shareOutline,
    });
  }

  get authorImage() {
    const author = this.accountService.accounts()
      .find((account) => account.id === this.post.authorId);

    return author && this.accountService.canViewProfileImage(
      author, this.accountService.selectedAccount(),
    ) ? author.profileImage : undefined;
  }

  get isLiked() {
    const id = this.accountService.selectedAccount()?.id;
    return id !== undefined && this.post.likes.includes(id);
  }

  get isReposted() {
    const id = this.accountService.selectedAccount()?.id;
    return id !== undefined && this.post.reposts.includes(id);
  }

  get isPostOwner() {
    return this.post.authorId !== null &&
      this.post.authorId === this.accountService.selectedAccount()?.id;
  }

  get canFollowAuthor() {
    const account = this.accountService.selectedAccount();
    return !!account && this.post.authorId !== null &&
      account.id !== this.post.authorId &&
      this.accountService.accounts()
        .some((item) => item.id === this.post.authorId);
  }

  get isFollowingAuthor() {
    return this.post.authorId !== null &&
      !!this.accountService.selectedAccount()?.followingIds
        .includes(this.post.authorId);
  }

  toggleAuthorOptions(event: MouseEvent) {
    event.stopPropagation();
    this.showMoreOptions = false;
    this.showAuthorOptions = !this.showAuthorOptions;
  }

  toggleMoreOptions(event: MouseEvent) {
    event.stopPropagation();
    this.showAuthorOptions = false;
    this.showMoreOptions = !this.showMoreOptions;
  }

  closeMenus() {
    this.showAuthorOptions = false;
    this.showMoreOptions = false;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (event.target instanceof Node &&
        !this.hostElement.nativeElement.contains(event.target)) {
      this.closeMenus();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    this.closeMenus();
  }

  toggleFollowAuthor() {
    const account = this.accountService.selectedAccount();
    if (!account) return this.requireAccount();

    const id = this.post.authorId;
    if (id === null || !this.canFollowAuthor) return;

    if (this.isFollowingAuthor) {
      this.accountService.unfollowAccount(id);
      this.actionMessage = `Unfollowed ${this.post.authorName}.`;
    } else {
      this.accountService.followAccount(id);
      this.actionMessage = `Following ${this.post.authorName}.`;
    }
    this.closeMenus();
  }

  private get currentPost(): Post {
    return this.postService.posts()
      .find((item) => item.id === this.post.id) ?? this.post;
  }

  get previewComments(): PostComment[] {
    if (!this.showCommentPreview ||
        !this.commentsEnabled || this.post.trashedAt) return [];

    const comments = this.currentPost.comments;
    if (!this.settingIs('hiddenWordsEnabled') ||
        typeof localStorage === 'undefined') {
      return comments.slice(-1);
    }

    const words = (localStorage.getItem('tali-hidden-words') ?? '')
      .split(',').map((word) => word.trim().toLowerCase()).filter(Boolean);

    return comments.filter((comment) =>
      !words.some((word) => comment.body.toLowerCase().includes(word)),
    ).slice(-1);
  }

  commentProfileImage(comment: PostComment): string | undefined {
    const author = this.accountService.accounts()
      .find((account) => account.id === comment.authorId);
    return author && this.accountService.canViewProfileImage(
      author, this.accountService.selectedAccount(),
    ) ? author.profileImage : undefined;
  }

  commentTimeAgo(comment: PostComment) {
    return this.formatTimeAgo(comment.createdAt);
  }

  isPreviewLiked(comment: PostComment) {
    const id = this.accountService.selectedAccount()?.id;
    return id !== undefined && (comment.likes ?? []).includes(id);
  }

  isPreviewReposted(comment: PostComment) {
    const id = this.accountService.selectedAccount()?.id;
    return id !== undefined && (comment.reposts ?? []).includes(id);
  }

  previewReplyCount(comment: PostComment) {
    return this.currentPost.comments.filter(
      (item) => item.parentCommentId === comment.id,
    ).length;
  }

  togglePreviewLike(comment: PostComment) {
    const account = this.accountService.selectedAccount();
    if (!account) return this.requireAccount();

    this.actionMessage = '';
    this.postService.toggleCommentLike(
      this.post.id, comment.id, account.id,
    );
  }

  togglePreviewRepost(comment: PostComment) {
    if (!this.sharingEnabled) return;
    const account = this.accountService.selectedAccount();
    if (!account) return this.requireAccount();

    this.actionMessage = '';
    this.postService.toggleCommentRepost(
      this.post.id, comment.id, account.id,
    );
  }

  replyToPreview(comment: PostComment) {
    if (!this.commentsEnabled) return;
    const account = this.accountService.selectedAccount();
    if (!account) return this.requireAccount();

    // Existing CommentsPage reads this draft when the modal opens.
    try {
      const key = `tali-comment-draft:${this.post.id}`;
      const saved = JSON.parse(sessionStorage.getItem(key) ?? 'null');

      sessionStorage.setItem(key, JSON.stringify({
        commentDraft: typeof saved?.commentDraft === 'string'
          ? saved.commentDraft : '',
        selectedMediaIndex: Number.isInteger(saved?.selectedMediaIndex)
          ? saved.selectedMediaIndex : 0,
        replyToId: comment.id,
      }));
    } catch {
      this.actionMessage =
        'Could not select this reply. Open comments and choose Reply there.';
      return;
    }

    this.openComments();
  }

  async sharePreview(comment: PostComment) {
    if (!this.sharingEnabled) return;
    this.actionMessage = '';

    const url = new URL('/home', window.location.origin);
    url.hash = `post-${this.post.id}`;

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

      const account = this.accountService.selectedAccount();
      if (account) {
        this.postService.recordCommentShare(
          this.post.id, comment.id, account.id,
        );
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        this.actionMessage = 'Could not share this comment.';
      }
    }
  }

  get hideLikeCounts() { return this.settingIs('hideLikeCounts'); }
  get hideShareCounts() { return this.settingIs('hideShareCounts'); }
  get commentsEnabled() { return this.settingIs('commentsEnabled', true); }
  get sharingEnabled() { return this.settingIs('sharingEnabled', true); }
  get dataSaver() { return this.settingIs('dataSaver'); }

  get autoplayVideos() {
    return this.settingIs('autoplayVideos', true) && !this.dataSaver;
  }

  private settingIs(key: string, fallback = false) {
    if (typeof localStorage === 'undefined') return fallback;
    const stored = localStorage.getItem(`tali-setting-${key}`);
    return stored === null ? fallback : stored === 'true';
  }

  private formatTimeAgo(value: Date) {
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

  get timeAgo() { return this.formatTimeAgo(this.post.createdAt); }

  get trashDaysRemaining() {
    if (!this.post.trashedAt) return 0;
    const elapsed = Date.now() - new Date(this.post.trashedAt).getTime();
    return Math.max(0, Math.ceil(
      (30 * 86400000 - elapsed) / 86400000,
    ));
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['post']) this.closeMenus();

    if (this.post && typeof sessionStorage !== 'undefined') {
      try {
        const saved = JSON.parse(
          sessionStorage.getItem('tali-open-comments') ?? 'null',
        ) as { postId?: string; pathname?: string } | null;
        if (saved?.postId === this.post.id &&
            saved.pathname === location.pathname) {
          this.commentsOpen = true;
        }
      } catch {
        /* Ignore unavailable session state. */
      }
    }

    if (!this.focusPostOnLoad ||
        (!changes['focusPostOnLoad'] && !changes['focusRequestId'])) return;

    setTimeout(() => {
      const element = document.getElementById(`post-${this.post.id}`);
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element?.classList.add('post-notification-focus');
      if (this.openCommentsOnLoad) this.openComments();
      setTimeout(
        () => element?.classList.remove('post-notification-focus'), 2200,
      );
    });
  }

  scrollAttachments(event: WheelEvent) {
    const row = event.currentTarget as HTMLElement;
    if (row.scrollWidth <= row.clientWidth) return;
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
      ? event.deltaX : event.deltaY;
    const next = row.scrollLeft + delta;
    if (next >= 0 && next <= row.scrollWidth - row.clientWidth) {
      event.preventDefault();
      row.scrollLeft = next;
    }
  }

  scrollAttachmentBy(event: MouseEvent, direction: -1 | 1) {
    const carousel = (event.currentTarget as HTMLElement).parentElement;
    const row = carousel?.querySelector<HTMLElement>('.post-attachments');
    const item = row?.querySelector<HTMLElement>('.post-media, .post-file');
    if (!row || !item) return;
    const gap = Number.parseFloat(getComputedStyle(row).columnGap) || 0;
    row.scrollBy({
      left: direction * (item.offsetWidth + gap), behavior: 'smooth',
    });
  }

  get hasMultipleImages() {
    return this.post.attachments.filter(
      (item) => item.type.startsWith('image/'),
    ).length > 1;
  }

  get hasVisualAttachments() {
    return this.post.attachments.some(
      (item) => item.type.startsWith('image/') ||
        item.type.startsWith('video/'),
    );
  }

  openComments() {
    if (!this.commentsEnabled) return;
    this.closeMenus();
    this.commentsOpen = true;
    try {
      sessionStorage.setItem('tali-open-comments', JSON.stringify({
        postId: this.post.id, pathname: location.pathname,
      }));
    } catch {
      /* Modal remains usable without storage. */
    }
  }

  closeComments() {
    this.commentsOpen = false;
    try {
      const saved = JSON.parse(
        sessionStorage.getItem('tali-open-comments') ?? 'null',
      );
      if (saved?.postId === this.post.id) {
        sessionStorage.removeItem('tali-open-comments');
      }
    } catch {
      /* Ignore unavailable session state. */
    }
  }

  startEditingPost() {
    if (!this.isPostOwner || this.post.trashedAt) return;
    this.editBody = this.post.body;
    this.editingPost = true;
    this.closeMenus();
  }

  saveEditedPost() {
    const id = this.accountService.selectedAccount()?.id;
    if (id === undefined ||
        (!this.editBody.trim() && !this.post.attachments.length)) {
      this.actionMessage = 'Keep post text or an attachment before saving this post.';
      return;
    }
    if (this.postService.updatePost(this.post.id, id, this.editBody)) {
      this.editingPost = false;
      this.actionMessage = 'Post updated.';
    }
  }

  togglePostNotifications() {
    const id = this.accountService.selectedAccount()?.id;
    if (id === undefined || !this.isPostOwner) return;
    const disabled = !this.post.notificationsDisabled;
    this.postService.setPostNotifications(this.post.id, id, disabled);
    this.actionMessage = disabled
      ? 'Notifications turned off for this post.'
      : 'Notifications turned on for this post.';
    this.closeMenus();
  }

  togglePostArchive() {
    const id = this.accountService.selectedAccount()?.id;
    if (id === undefined || !this.isPostOwner) return;
    if (this.post.archivedAt) {
      this.postService.unarchivePost(this.post.id, id);
      this.actionMessage = 'Post moved back to your profile.';
    } else {
      this.postService.archivePost(this.post.id, id);
      this.actionMessage = 'Post moved to your archive.';
    }
    this.closeMenus();
  }

  movePostToTrash() {
    const id = this.accountService.selectedAccount()?.id;
    if (id === undefined || !this.isPostOwner) return;
    this.postService.trashPost(this.post.id, id);
    this.actionMessage = 'Post moved to trash. You can restore it for 30 days.';
    this.closeMenus();
  }

  restorePost() {
    const id = this.accountService.selectedAccount()?.id;
    if (id === undefined || !this.isPostOwner) return;
    this.postService.restorePost(this.post.id, id);
    this.closeMenus();
  }

  deletePostPermanently() {
    const id = this.accountService.selectedAccount()?.id;
    if (id === undefined || !this.isPostOwner || !this.post.trashedAt) return;
    this.postService.permanentlyDeletePost(this.post.id, id);
    this.closeMenus();
  }

  async copyPostLink() {
    const url = new URL('/home', window.location.origin);
    url.hash = `post-${this.post.id}`;
    try {
      await navigator.clipboard.writeText(url.toString());
      this.actionMessage = 'Post link copied.';
    } catch {
      this.actionMessage = 'Could not copy the post link in this browser.';
    }
    this.closeMenus();
  }

  toggleLike() {
    const account = this.accountService.selectedAccount();
    if (!account) return this.requireAccount();
    this.actionMessage = '';
    this.postService.toggleLike(this.post.id, account);
  }

  toggleRepost() {
    const account = this.accountService.selectedAccount();
    if (!account) return this.requireAccount();
    this.actionMessage = '';
    this.postService.toggleRepost(this.post.id, account);
  }

  async sharePost() {
    if (!this.sharingEnabled) return;
    this.actionMessage = '';
    const url = new URL(window.location.href);
    url.hash = `post-${this.post.id}`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: `${this.post.authorName} on Tali`,
          text: this.post.body, url: url.toString(),
        });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url.toString());
        this.actionMessage = 'Link copied.';
      } else {
        this.actionMessage = 'Sharing is not available in this browser.';
        return;
      }
      const account = this.accountService.selectedAccount();
      if (account) this.postService.recordShare(this.post.id, account);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        this.actionMessage = 'Could not share this post.';
      }
    }
  }

  private requireAccount() {
    this.actionMessage = 'Select an account to interact with posts.';
  }
}