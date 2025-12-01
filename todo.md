# Allgorithm Bot - Project TODO

## Phase 1: Database & Schema ✅
- [x] Design database schema with 14 tables
- [x] Create users table with telegramId
- [x] Create userProfiles table for questionnaire
- [x] Create games, gameEvents, gameRegistrations tables
- [x] Create stockKnowQuestions, stockKnowAnswers tables
- [x] Create fastDatesMatches table
- [x] Create supportTickets, supportMessages tables
- [x] Create vouchers, userVouchers, freeGameCounters tables
- [x] Create adminLogs table
- [x] Run database migrations

## Phase 2: Core Bot Structure ✅
- [x] Set up Telegram bot library (telegraf)
- [x] Create bot initialization and webhook setup
- [x] Implement main menu keyboard
- [x] Create user registration flow (5 questions)
- [x] Implement user profile storage

## Phase 3: User Registration ✅
- [x] /start command handler
- [x] Greeting message
- [x] "Пройти анкету" (Take questionnaire) button
- [x] Question 1: Name input
- [x] Question 2: Date of birth (DD.MM.YYYY validation)
- [x] Question 3: Secret fact input
- [x] Question 4: Strange story input
- [x] Question 5: Gender selection (Male/Female)
- [x] Save profile to database
- [x] Show main menu after registration

## Phase 4: Main Menu ✅
- [x] Implement persistent keyboard with 4 buttons
- [x] "Игры" (Games) button
- [x] "Личный кабинет" (Personal Account) button
- [x] "Помощь" (Help) button
- [x] "Правила" (Rules) button

## Phase 5: Games System (In Progress)
- [x] Create games list view
- [x] Initialize default games in database
- [x] Game registration system
- [ ] Implement Talk & Toast game:
  - [ ] Game rules display
  - [ ] "Записаться" (Register) button
  - [ ] Date selection (next 2 weeks)
  - [ ] Restaurant/cuisine selection
  - [ ] Payment integration (Stripe)
  - [ ] "Дай тему!" (Give topic) button during game
  - [ ] Random question generation
  - [ ] Quiz at 15 minutes before end
- [ ] Implement Stock & Know game:
  - [ ] Game rules display
  - [ ] Registration button
  - [ ] Date selection
  - [ ] Admin question management
  - [ ] Answer submission from participants
  - [ ] Hints system (3 hints)
  - [ ] Winner selection
- [ ] Implement Fast Dates game:
  - [ ] Game rules display
  - [ ] Registration button
  - [ ] Date selection
  - [ ] Table number assignment (for women)
  - [ ] Round management
  - [ ] Vote submission
  - [ ] Match results

## Phase 6: Help & Support ✅
- [x] Implement live chat with admin
- [x] Message forwarding to admin
- [x] Admin reply system
- [x] 5-10 minute response SLA display

## Phase 7: Personal Account (In Progress)
- [x] "Мои игры" (My Games) - list of registered games
- [x] "Мои данные" (My Data) - profile information
- [ ] "Сколько до бесплатной 5-й" (Free games counter) - UI needed
- [ ] "Активные ваучеры" (Active vouchers) - display -10 zł
- [ ] "У меня есть ваучер" (I have a voucher) - receipt photo upload
- [x] Admin voucher verification

## Phase 8: Admin Panel ✅
- [x] /panel command (admin only)
- [x] Add event in one line
- [x] Today's games management
- [x] Stock & Know admin controls
- [x] Fast Dates admin controls
- [x] Voucher verification queue
- [x] Help message review
- [x] Statistics & broadcasting (placeholder)

## Phase 9: Stripe Integration (TODO)
- [ ] Stripe payment setup
- [ ] Payment processing for games
- [ ] Payment confirmation
- [ ] Refund handling

## Phase 10: Testing & Deployment (TODO)
- [ ] Test user registration flow
- [ ] Test all three games
- [ ] Test admin panel
- [ ] Test help/support system
- [ ] Test personal account
- [ ] Deploy to Render with Python/GitHub
- [ ] Set up webhook for Telegram
- [x] Create deployment documentation (BOT_SETUP.md)

## Notes
- All text content (rules, help messages, etc.) to be added by user
- Placeholder markers to be placed for user-customizable content
- Bot should handle errors gracefully
- All timestamps in UTC
- Support for Russian language throughout
