import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonAvatar,
  IonButton,
  IonContent,
  IonFooter,
  IonIcon,
  IonToolbar,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  addCircle,
  arrowUpOutline,
  closeOutline,
  notificationsOutline,
  peopleOutline,
  personCircleOutline,
  searchOutline,
  trendingUpOutline,
} from 'ionicons/icons';

import { AccountService } from '../../services/account.service';
import { NotificationService } from '../../services/notification.service';
import { ViewStateService } from '../../services/view-state.service';

@Component({
  selector: 'app-search',
  standalone: true,
  templateUrl: './search.page.html',
  styleUrls: ['./search.page.scss'],
  imports: [
    RouterLink,
    IonAvatar,
    IonButton,
    IonContent,
    IonFooter,
    IonIcon,
    IonToolbar,
  ],
})
export class SearchPage {
  private readonly stateKey = 'tali-view-search';

  readonly accountService = inject(AccountService);
  readonly notificationService = inject(NotificationService);
  readonly viewState = inject(ViewStateService);

  query = '';

  readonly topics = [
    'Good questions',
    'Creative practice',
    'Daily reflections',
    'Community care',
  ];

  constructor() {
    addIcons({
      addCircle,
      arrowUpOutline,
      closeOutline,
      notificationsOutline,
      peopleOutline,
      personCircleOutline,
      searchOutline,
      trendingUpOutline,
    });

    this.query = this.viewState.read(this.stateKey, '');
  }

  get unreadNotifications() {
    const accountId = this.accountService.selectedAccount()?.id;

    return accountId === undefined
      ? 0
      : this.notificationService.unreadCount(accountId);
  }

  setQuery(query: string) {
    this.query = query;
    this.viewState.write(this.stateKey, query);
  }

  get filteredPeople() {
    const query = this.query.trim().toLowerCase();
    const selectedId = this.accountService.selectedAccount()?.id;

    return this.accountService.accounts()
      .filter((person) => person.id !== selectedId)
      .filter((person) =>
        `${person.name} ${person.username}`
          .toLowerCase()
          .includes(query),
      );
  }

  get filteredTopics() {
    const query = this.query.trim().toLowerCase();

    return this.topics.filter((topic) =>
      topic.toLowerCase().includes(query),
    );
  }
}