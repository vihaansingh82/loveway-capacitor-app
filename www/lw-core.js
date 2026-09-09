/* ============================================================
   Loveway — shared core (auth + i18n + routing)
   ------------------------------------------------------------
   Load order har page pe:
     1. supabase-js  (CDN)
     2. config.js
     3. lw-core.js   <-- ye file
   Backend 100% Supabase hai: Supabase Auth (email/password,
   Google, OTP) + public.profiles table.
   ============================================================ */
(function () {
  'use strict';

  /* ---------- 1. Config check ---------- */
  var cfg = window.LOVEWAY_CONFIG || {};
  var configOk = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY &&
                    cfg.SUPABASE_ANON_KEY.indexOf('PASTE_YOUR') !== 0);
  if (!configOk) {
    console.error('[Loveway] config.js me SUPABASE_URL / SUPABASE_ANON_KEY set nahi hai.');
  }

  /* ---------- 2. Supabase client (singleton) ---------- */
  var sb = null;
  if (configOk && window.supabase && window.supabase.createClient) {
    sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
        storageKey: 'loveway-auth'
      }
    });
  }

  /* ---------- 3. Translations ---------- */
  window.LW_LANG = {
 "en": {
  "callbackRedirecting": "Taking you to Loveway…",
  "callbackCompletingMsg": "Completing sign-in from Google…",
  "callbackRetryLink": "Back to login page",
  "callbackFailedTitle": "Sign-in failed",
  "callbackSpotifyHint": "You can retry connecting Spotify from Settings.",
  "callbackNoSessionErr": "No session found. Please try logging in again.",
  "callbackDoneRedirecting": "Done! Redirecting…",
  "otpAlreadySentMsg": "OTP already sent. Please check your messages.",
  "openingDashboardMsg": "Opening dashboard…",
  "signupCodeSentPrefix": "A 6-digit code has been sent to ",
  "signupCodeSentSuffix": ".",
  "youBlockedThemMsg": "🚫 You have blocked this user",
  "unblockBtn": "Unblock",
  "blockUserLink": "🚫 Block this user",
  "unblockedToast": "Unblocked",
  "userNotFoundEmptyMsg": "User not found",
  "familyPageTitle": "🌳 My Family",
  "addFamilyMemberBtn": "+ Add Member",
  "familyChartTab": "📊 Family Chart",
  "familyListTab": "📋 List",
  "familyChartHint": "The chart only forms when members have a \"child of\" (parent) set.\nDon\u0027t set a parent for the topmost person — they become the root.",
  "noteFieldLabel": "Note",
  "familyRelationLabel": "Relation",
  "familyRelSelf": "Myself",
  "familyRelFather": "Father",
  "familyRelMother": "Mother",
  "familyRelBrother": "Brother",
  "familyRelSister": "Sister",
  "familyRelSpouse": "Husband / Wife",
  "familyRelSon": "Son",
  "familyRelDaughter": "Daughter",
  "familyRelGrandfather": "Grandfather",
  "familyRelGrandmother": "Grandmother",
  "familyRelGrandson": "Grandson",
  "familyRelGranddaughter": "Granddaughter",
  "familyRelUncle": "Uncle",
  "familyRelAunt": "Aunt",
  "familyRelCousin": "Cousin",
  "familyRelNephew": "Nephew",
  "familyRelNiece": "Niece",
  "familyRelFatherInLaw": "Father-in-law",
  "familyRelMotherInLaw": "Mother-in-law",
  "familyRelOther": "Other",
  "familyGenderMale": "Male",
  "familyGenderFemale": "Female",
  "familyGenderOther": "Other",
  "familyPhotoUrlLabel": "Photo URL",
  "familyParentFieldLabel": "Child of? (for chart)",
  "familyNoParentOption": "— none (topmost) —",
  "familyLovewayUsernameLabel": "On Loveway? (username)",
  "familyUsernamePh": "@username — optional",
  "familyNamePh": "Full name",
  "addFamilyMemberModalTitle": "Add Family Member",
  "familyTreeEmptyTitle": "No family members yet.",
  "familyTreeEmptySub": "Tap \"+ Add Member\" to get started.",
  "familyEditBtn": "Edit",
  "familyListEmpty": "No members in the list.",
  "familyEditModalTitle": "Edit Family Member",
  "familyNameRequiredErr": "Name is required",
  "familyUserNotFoundWarnSuffix": "\" — Loveway user not found, member added without link",
  "familyMemberSavedMsg": "Saved ✨",
  "familyDeleteConfirm": "Remove this family member?",
  "familyMemberRemovedMsg": "Member removed",
  "familyPublicChip": "👁 public",
  "nearbyAreaTitle": "📍 People in your area",
  "setLocationTitle": "📍 Set your location",
  "setLocationSub": "So people in your area can find you",
  "setLocationBtn": "Set",
  "noFriendsTitle": "No friends yet.",
  "noFriendsSub": "Find people from the \"Find people\" tab.",
  "friendsCountSuffix": "friends",
  "blockTitle": "Block",
  "noRequestsMsg": "No new requests.",
  "lessThan1kmLabel": "less than 1 km",
  "awaySuffix": "away",
  "minCharsMsg": "Type at least 2 letters.",
  "searchingMsg": "Searching…",
  "noResultsMsg": "Nobody found.",
  "requestSentToast": "✅ Request sent",
  "nowFriendsToast": "✅ You're friends now!",
  "requestDeclinedToast": "Request declined",
  "blockConfirmSuffix": " — block them? They'll be removed from your friends list.",
  "blockedToast": "🚫 Blocked",
  "unfriendConfirm": "Remove this friend from the list?",
  "removedToast": "Removed",
  "goalsPageTitle": "🎯 Goals & Gifts",
  "goalsTabLabel": "🎯 Goals",
  "giftsTabLabel": "🎁 Gifts",
  "goalsNewGoalHeading": "➕ New goal",
  "goalsTitlePh": "Read for 30 min daily, go to the gym…",
  "goalsDaily": "Daily",
  "goalsWeekly": "Weekly",
  "goalsOnce": "One-time",
  "goalsTargetDateTitle": "Target date",
  "goalsPublicLabel": "Visible to friends",
  "goalsAddBtn": "Add goal",
  "goalsSendGiftHeading": "🎁 Send a gift",
  "goalsToWhomLabel": "To whom?",
  "goalsPickFriendOption": "— pick a friend —",
  "goalsKindGift": "🎁 Gift",
  "goalsKindRestaurant": "🍽️ Restaurant / outing",
  "goalsKindSong": "🎵 Song",
  "goalsKindFlower": "🌹 Flowers",
  "goalsKindCard": "💌 Card",
  "goalsGiftTitlePh": "What are you sending",
  "goalsMessageLabel": "Message",
  "goalsGiftMsgPh": "Write something sweet…",
  "goalsMyStreakHeading": "🔥 My streak",
  "goalsStreakDaysLabel": "day streak going",
  "goalsLongestLabel": "Longest",
  "goalsLastDayLabel": "Last day",
  "goalsStreakInfoPre": "Streak grows every day when you",
  "goalsStreakInfoAction1": "post",
  "goalsStreakInfoAction2": "check in on any goal",
  "goalsStreakInfoPost": ". Miss a day and it restarts from 1.",
  "goalsTodayHeading": "📅 Today's rundown",
  "goalsActiveHeading": "Active goals",
  "goalsCompletedHeading": "Completed",
  "goalsEmptyMsg": "No goals yet.<br>Add your first goal above.",
  "goalsPendingSuffix": "goal(s) pending today.",
  "goalsPendingHint": "Even one check-in will grow your streak.",
  "goalsAllDoneMsg": "✅ All of today's goals are done. Well done!",
  "goalsNoActiveMsg": "No active goals right now.",
  "goalsCheckinBtn": "Today's check-in ✓",
  "goalsFinishBtn": "Mark done",
  "goalsCheckinSuffix": " check-in",
  "goalsPublicSuffix": "public",
  "goalsWriteGoalErr": "Write a goal",
  "goalsAddedMsg": "✅ Goal added",
  "goalsAlreadyCheckedInMsg": "Already checked in today",
  "goalsCheckinDoneMsg": "🔥 Checked in! Streak grew.",
  "goalsCongratsMsg": "🎉 Congratulations!",
  "goalsDeleteConfirm": "Delete this goal?",
  "goalsFromLabel": "from ",
  "goalsToLabel": "to ",
  "goalsOpenBtn": "Open",
  "goalsNoGiftsMsg": "No gifts yet.",
  "goalsGiftOpenedMsg": "🎁 Gift opened!",
  "goalsPickRecipientErr": "Choose who to send to",
  "goalsGiftNameErr": "Write the gift's name",
  "goalsGiftSentMsg": "✅ Gift sent!",
  "changePhotoTitle": "Change photo",
  "changePhotoBtn": "📷 Change photo",
  "statFamily": "Family",
  "badgesHeading": "🏅 Badges",
  "currentTimelineHeading": "📜 Current Timeline",
  "fullNameFieldLabel": "Full Name",
  "cityFieldLabel": "City",
  "professionFieldLabel": "Profession",
  "professionPh": "Teacher, Business, Student…",
  "pincodeFieldLabel": "Pincode",
  "relationshipFieldLabel": "Relationship status",
  "chooseOption": "— choose —",
  "relSingle": "Single",
  "relInRelationship": "In a relationship",
  "relEngaged": "Engaged",
  "relMarried": "Married",
  "relComplicated": "It's complicated",
  "relPrivate": "Prefer not to say",
  "partnerFieldLabel": "Partner (username)",
  "partnerUsernamePh": "@username",
  "profilePhotoFieldLabel": "Profile photo",
  "bioFieldLabel": "Bio (short line)",
  "storyFieldLabel": "My Story",
  "storyPh": "Write about yourself…",
  "hobbiesFieldLabel": "Hobbies (comma-separated)",
  "hobbiesPh": "Music, Travel, Cooking",
  "favouritesFieldLabel": "Favourites",
  "favSongPh": "Favourite song",
  "favFoodPh": "Favourite food",
  "favMoviePh": "Favourite movie",
  "favPlacePh": "Favourite place",
  "detailsEmptyMsg": "Nothing filled in yet.",
  "joinedLabel": "Joined",
  "storyEmptyMsg": "No story written yet.",
  "hobbiesEmptyMsg": "No hobbies added.",
  "favsEmptyMsg": "Nothing added yet.",
  "partnerLinkedHint": "Currently linked",
  "userNotFoundPrefix": "❌ No user found named",
  "cantBeOwnPartnerMsg": "❌ You can't be your own partner",
  "profileSavedMsg": "✅ Profile saved",
  "avatarSizeErr": "❌ Photo should be smaller than 5MB",
  "avatarUpdatedMsg": "✅ Profile photo updated",
  "timelineEmptyTitle": "Timeline is empty right now.",
  "timelineEmptySub": "Post something, make friends — it'll all show up here.",
  "noPostsMsg": "No posts yet.",
  "familyLinkBtn": "🌳 Family",
  "friendsLinkBtn": "👥 Friends",
  "badge7DayStreak": "7-day streak",
  "badge30DayStreak": "30-day streak",
  "badge10Friends": "10+ friends",
  "badge20Posts": "20+ posts",
  "badgeCommitted": "Committed",
  "communityPageTitle": "🏘️ Communities",
  "communityNewBtn": "+ New community",
  "communityFeaturedTitle": "✨ Featured Communities",
  "communityCityFilterPh": "Search by city — Delhi, Mumbai…",
  "communityCityFilterHintPrefix": "City — like ",
  "communityTabMine": "Mine",
  "communityFeedTab": "📝 Feed",
  "communityMembersTab": "👥 Members",
  "communityActivitiesTab": "📌 Activities",
  "communityPostPh": "Write something in the community… (suggest a place, restaurant)",
  "communityCreateModalTitle": "Create a new community",
  "communityCityLabel": "City",
  "communityPincodeLabel": "Pincode",
  "communityAboutLabel": "What is this community for?",
  "communityNamePh": "Rohini Loveway, Pune Friends…",
  "communityPublicLabel": "Anyone can join",
  "communityOpenBtn": "Open",
  "communityJoinBtn": "Join",
  "communityLeaveBtn": "Leave",
  "communityLockedPrefix": "🔒 Only for ",
  "communityLockedSuffix": "",
  "communityFeaturedFallback": "Featured",
  "communityTypeSuffix": " community",
  "communityCatCouples": "Couples",
  "communityCatSingles": "Singles",
  "communityCatSpiritual": "Spiritual",
  "communityCatHeartbreak": "Heartbreak",
  "communityCatHealing": "Healing",
  "communityCatStudent": "Student",
  "communityCatHeartTalk": "Heart Talk",
  "communityCatProfessional": "Office",
  "communityJoinedMsg": "✅ Joined the community",
  "communityLeaveConfirm": "Leave this community?",
  "communityLeftMsg": "Left",
  "communityNoneFoundMsg": "No community found.",
  "communityCreateHintMsg": "Here's your chance to create one!",
  "communityFeedEmptyMsg": "No posts in the community yet.",
  "communityMembersEmptyMsg": "No members.",
  "communityNoTimeMsg": "No time set",
  "communityGoingSuffix": " going",
  "communityBoardBtn": "Board",
  "communityNoActivityMsg": "No activity yet.",
  "communityActivityBoardLink": "Activity board",
  "communityCreateFromBoardSuffix": " to create one.",
  "communityNameRequiredErr": "Enter a name",
  "communityCreatedMsg": "✅ Community created",
  "communityMemberRoleFallback": "member",
  "notifPageTitle": "🔔 Notifications",
  "notifMarkAllReadBtn": "Mark all as read",
  "notifEmptyMsg": "No notifications yet.",
  "notifAllReadMsg": "All marked as read",
  "activitiesPageTitle": "📌 Activity Board",
  "activitiesNewBtn": "+ Post an activity",
  "activitiesTabUpcoming": "🗓️ Upcoming",
  "activitiesTabGoing": "✅ I'm going",
  "activitiesTabMine": "🎤 Created by me",
  "activitiesNewModalTitle": "New activity",
  "activitiesWhatLabel": "What's happening?",
  "activitiesTitlePh": "Sunday cricket, Chai meetup, Dinner…",
  "activitiesDetailLabel": "Detail",
  "activitiesDescPh": "What for, what to bring, cost…",
  "activitiesLocPh": "Park, cafe name",
  "activitiesCityLabel": "City",
  "activitiesStartLabel": "Starts at",
  "activitiesCapLabel": "How many people (optional)",
  "activitiesCommLabel": "Community (optional)",
  "activitiesNoCommOpt": "— none, open to all —",
  "activitiesNoTimeMsg": "Time not set",
  "activitiesEmptyTitle": "Nothing here yet.",
  "activitiesEmptySub": "Post the first activity!",
  "activitiesYourChip": "Your activity",
  "activitiesFullChip": "Full",
  "activitiesJoinBtn": "I'll come",
  "activitiesGoingSuffix": "going",
  "activitiesMaybeBtn": "🤔 Maybe",
  "activitiesJoinedMsg": "✅ You're going!",
  "activitiesNotedMsg": "Noted",
  "activitiesCancelledMsg": "Cancelled",
  "activitiesTitleShortErr": "Write a bit more of a title",
  "activitiesPostedMsg": "✅ Activity posted",
  "titleLogin": "Welcome Back!",
  "subLogin": "Login to continue to Loveway ❤",
  "userTab": "Login with Username",
  "mobileTab": "Login with Mobile",
  "loginIdLabel": "Email, username or mobile",
  "loginIdPh": "Email, username or mobile",
  "themeRomanticTitle": "Romantic",
  "themeDarkTitle": "Dark",
  "themeOceanTitle": "Ocean",
  "themeSunsetTitle": "Sunset",
  "themeModernTitle": "Modern",
  "username": "Username",
  "mobile": "Mobile Number",
  "password": "Password",
  "forgot": "Forgot Password?",
  "remember": "Remember Me",
  "login": "Login ❤",
  "or": "or",
  "googleLogin": "🇬 Login with Google",
  "noAccount": "Don’t have an account?",
  "signup": "Sign Up",
  "placeholderUser": "rahul_07",
  "placeholderMobile": "+91 9876543210",
  "verifyTitle": "Verify Your Number",
  "verifySub": "A 6-digit OTP has been sent to your mobile",
  "resendIn": "Resend OTP in",
  "verify": "Verify OTP ✓",
  "noOtp": "Didn’t receive the OTP?",
  "resend": "Resend OTP",
  "signupTitle": "Create Your Account",
  "signupSub": "Join Loveway and become part of our family 💌",
  "fullName": "Full Name *",
  "fullNamePh": "Rahul Kumar",
  "address": "Address",
  "addressPh": "123, Green Street, Delhi",
  "gender": "Gender",
  "male": "♂ Male",
  "female": "♀ Female",
  "other": "⚧ Other",
  "dob": "Date of Birth",
  "minPass": "Min 6 characters",
  "confirmPass": "Confirm Password *",
  "sendOtp": "Send OTP ❤",
  "googleSignup": "🇬 Sign Up with Google",
  "haveAccount": "Already have an account?",
  "loginLink": "Login",
  "adminTitle": "👥 Admin — Users",
  "refresh": "Refresh",
  "userManagement": "User Management",
  "searchUsers": "Search users...",
  "logout": "Logout",
  "navHome": "Home",
  "navLifeChain": "Life Chain",
  "navGoals": "Goals",
  "navFriends": "Friends",
  "navSettings": "Settings",
  "navNotifications": "Notifications",
  "navCommunity": "Community",
  "navChat": "Messages",
  "navBoard": "Board",
  "messagesSoFarSuffix": "messages so far",
  "navProfile": "Profile",
  "journeyPageTitle": "⛓️ Life Chain — Our Journey",
  "photoFieldLabel": "Photo",
  "importantBadge": "⭐ Important",
  "saveBtn": "Save",
  "addMemoryBtn": "+ Add Memory",
  "journeySubtitle": "You and your partner — memories added by both of you join the same chain.",
  "newMemoryModalTitle": "⛓️ Add a new memory",
  "uploadImageBtn": "📷 Upload Image",
  "titleFieldLabel": "Title",
  "journeyTitlePh": "Our first date…",
  "quoteFieldLabel": "Quote / story",
  "journeyQuotePh": "What happened that day, how did it feel…",
  "dateFieldLabel": "Date",
  "locationFieldLabel": "📍 Location",
  "journeyLocationPh": "Goa, Marine Drive… (or pick from map)",
  "pickFromMapTitle": "Pick from map",
  "importantMilestoneLabel": "⭐ Important milestone",
  "savingMsg": "Saving…",
  "onlyImageErr": "❌ Pick an image only",
  "photoSizeErr": "❌ Photo should be smaller than 15MB",
  "uploadingPhotoMsg": "⏳ Uploading photo…",
  "photoReadyMsg": "✅ Photo ready",
  "journeyMinFieldsErr": "❌ Add at least a title, quote or photo",
  "memoryAddedMsg": "✅ Memory added to the chain",
  "viewAddUpdatesLabel": "💬 View / add updates",
  "journeyEmptyTitle": "Chain is empty right now.",
  "journeyEmptySub": "Add the first memory yourself!",
  "noUpdatesYet": "No updates yet.",
  "updatePh": "Write an update…",
  "deleteMemoryConfirm": "Remove this memory from the chain?",
  "deleteTitle": "Delete",
  "memoryDeletedMsg": "Memory removed",
  "composerPh": "What's on your mind?",
  "storyCaptionPh": "Write something… (optional)",
  "pickFromSpotifyBtn": "🎵 Pick from Spotify",
  "feedLoadingMsg": "Loading feed…",
  "nothingToPostErr": "Write something first",
  "postingMsg": "Posting…",
  "postSuccessMsg": "✅ Posted!",
  "photoReadyPostMsg": "✅ Photo ready — tap \"Post\" now",
  "songPickedSuffix": " selected",
  "feedLoadFailedMsg": "Couldn't load the feed.",
  "emptyFeedTitle": "Nothing here yet.",
  "emptyFeedSub": "Be the first to post!",
  "deletePostConfirm": "Delete this post?",
  "postDeletedMsg": "Post deleted",
  "noCommentsYet": "No comments yet.",
  "myStoryLabel": "Your Story",
  "addStoryLabel": "Add Story",
  "removeLabel": "Remove",
  "storyAddedMsg": "✅ Story added — visible for 24 hours",
  "todayLabel": "🎉 Today!",
  "daysLeftSuffix": " days left",
  "noBdaysMsg": "No birthdays in the next 30 days.",
  "doneTodayLabel": "✅ done today",
  "pendingLabel": "⏳ pending",
  "noGoalsMsg": "No goals set.",
  "noCommunitiesMsg": "Not part of any community yet.",
  "storyModalTitle": "⚡ Create a Story",
  "addMusicBtn": "🎵 Add Music",
  "pending": "Pending",
  "approved": "Approved",
  "rejected": "Rejected",
  "all": "All",
  "loading": "Loading...",
  "attachTitle": "Photo / Video / Music",
  "stickerTitle": "Sticker",
  "emojiTitle": "Emoji",
  "noChatsTitle": "No chats yet.",
  "noChatsSub": "Send a message from a friend's profile.",
  "communityChatTitle": "Community chat",
  "chatTitleShort": "Chat",
  "peopleCountSuffix": "people",
  "giftSentDefault": "Sent a gift",
  "songDefaultLabel": "Song",
  "audioDefaultLabel": "Audio",
  "reactTitle": "React",
  "attachPhotoVideoItem": "🖼️🎬 Photo / Video",
  "attachMusicItem": "🎼 Music / Audio",
  "groupNamePh": "Boys group, College friends…",
  "messagesLoading": "Loading messages…",
  "dedicationNoteLabel": "Dedication message (optional)",
  "dedicationNotePh": "This song is for you…",
  "sendDedicationBtn": "💌 Send",
  "pickChatFirstErr": "Please choose a chat first, then send the dedication",
  "dedicationSentMsg": "✅ Dedication sent",
  "songNameRequiredErr": "Write the song's name",
  "songSentMsg": "✅ Song sent",
  "noMessagesYet": "No messages yet. Send the first one!",
  "fileSizeErr": "❌ File must be under 25MB",
  "uploadingMsg": "⏳ Uploading…",
  "sentMsg": "✅ Sent",
  "noTokenMsg": "Please sign in/connect with Spotify first to see playlists.",
  "tokenExpiredMsg": "Looks like your Spotify session expired — reconnect.",
  "connectSpotifyBtn": "🎵 Connect Spotify",
  "shareSongInsteadBtn": "🎵 Send via Share Song",
  "noPlaylistsFound": "No playlists found.",
  "songsCountSuffix": "songs",
  "loadFailedMsg": "Couldn't load.",
  "noTracksInPlaylist": "No songs in this playlist.",
  "backToPlaylists": "⬅ Playlists",
  "youLabel": "You",
  "someoneLabel": "Someone",
  "makeFriendsFirstMsg": "Make some friends first.",
  "groupCreatedMsg": "✅ Group created",
  "groupNameRequiredErr": "Write the group name",
  "pickFriendErr": "Pick at least one friend",
  "creatingMsg": "Creating…",
  "privateChatLabel": "Private chat",
  "typingSuffix": "is typing",
  "replyLabel": "Reply",
  "photoLabel": "📷 Photo",
  "videoLabel": "🎬 Video",
  "audioLabel": "🎼 Audio",
  "giftLabel": "🎁 Gift",
  "unknownLabel": "Unknown",
  "devModeHint": "Spotify connect is currently open only to a few select accounts (Spotify's \"Development mode\" allowlist) — if it doesn't connect, use the option below to send a link directly instead.",
  "adminGate": "For admin access, please",
  "loginFirst": "login first",
  "loadFail": "Could not load. Refresh and try again.",
  "noUsers": "No users in this category.",
  "name": "Name",
  "usernameCol": "Username",
  "mobileCol": "Mobile",
  "genderCol": "Gender",
  "dobCol": "DOB",
  "status": "Status",
  "joined": "Joined",
  "action": "Action",
  "approve": "Approve",
  "reject": "Reject",
  "otpSent": "6-digit OTP sent:",
  "otpSendFail": "Could not send OTP:",
  "otpComplete": "Enter the complete 6-digit OTP",
  "otpExpired": "OTP session expired. Tap Resend OTP",
  "verifying": "Verifying...",
  "wrongOtp": "❌ Wrong OTP or server error. Please try again.",
  "newOtp": "📱 A new OTP has been sent!",
  "server": "Could not connect to the server.",
  "fillRequired": "Please fill all required (*) fields",
  "sending": "Sending...",
  "googleSignupProgress": "Signing up with Google...",
  "googleSignupError": "Google sign-up failed. Please try again.",
  "loginProgress": "Logging in...",
  "googleLoginProgress": "Logging in with Google...",
  "googleLoginError": "Google login failed. Please try again.",
  "bothFields": "Please fill both fields",
  "pendingLogin": "⏳",
  "verifyMobile": "📱 Please verify your mobile first.",
  "serverError": "Could not connect to the server.",
  "emailTab": "Login with Email",
  "email": "Email",
  "emailPh": "rahul@example.com",
  "microsoftLogin": "Ⓜ Login with Microsoft",
  "microsoftSignup": "Ⓜ Sign Up with Microsoft",
  "microsoftProgress": "Logging in with Microsoft...",
  "microsoftError": "Microsoft login failed. Please try again.",
  "loginId": "Email, username or mobile",
  "pendingTitle": "Account waiting for approval",
  "pendingSub": "Your account is created. You can log in once an admin approves it.",
  "rejectedTitle": "Account rejected",
  "rejectedSub": "An admin rejected this account. Contact support if you need help.",
  "checkAgain": "Check again",
  "backHome": "← Back to home",
  "completeTitle": "Complete your profile",
  "completeSub": "Just a little more information 💌",
  "saveContinue": "Save and continue →",
  "otpEmailSub": "A 6-digit code has been sent to your email",
  "sendCode": "Send code",
  "codeVerified": "✅ Verified!",
  "dashboard": "Dashboard",
  "myAccount": "My account",
  "signOut": "Log out",
  "settings": "Settings",
  "passShort": "Password must be at least 6 characters",
  "passMismatch": "Passwords do not match",
  "userTaken": "That username is already taken",
  "emailRequired": "Email is required",
  "resetSent": "Password reset link sent to your email",
  "resetPrompt": "Enter your email:",
  "signupOk": "Account created! Verify it now.",
  "loggedOut": "Logged out.",
  "noProfile": "Profile not found.",
  "contactUs": "Contact us",
  "pendingNote": "This page moves on by itself once you are approved",
  "verifyStep": "Verify",
  "kindPost": "✍️ Post",
  "kindPhoto": "📷 Photo",
  "kindSong": "🎵 Song dedicate",
  "kindAnnouncement": "📢 Announcement",
  "kindStory": "⚡ Story (24 hours)",
  "visFriends": "👥 Friends",
  "visClose": "💚 Close Friends",
  "visPublic": "🌍 Everyone",
  "visPartner": "💑 Partner",
  "visPrivate": "🔒 Only me",
  "postSubmit": "Post",
  "tabAll": "All",
  "tabMine": "My posts",
  "tabSongs": "🎵 Dedications",
  "tabAnnouncements": "📢 Announcements",
  "viewProfileBtn": "View profile",
  "upcomingBdays": "🎂 Upcoming birthdays",
  "todaysGoals": "🎯 Today's goals",
  "allGoalsBtn": "All goals",
  "myCommunities": "🏘️ My communities",
  "seeMoreBtn": "See more",
  "commentsTitle": "💬 Comments",
  "commentPh": "Write a comment…",
  "sendBtn": "Send",
  "closeBtn": "Close",
  "statFriends": "Friends",
  "statPosts": "Posts",
  "statStreak": "Streak 🔥",
  "chatTitle": "💬 Chat",
  "newGroupBtn": "+ New group",
  "chatPickHint": "Choose a chat from the left",
  "chatEmptyHint": "Choose a chat or create a new group.",
  "msgPh": "Write a message…",
  "groupModalTitle": "New group chat",
  "groupNameLabel": "Group name",
  "groupMembersLabel": "Who's in?",
  "cancelBtn": "Cancel",
  "createBtn": "Create",
  "shareSongBtn": "🎵 Share a song",
  "songTitlePh": "Song name",
  "songArtistPh": "Singer",
  "songUrlPh": "Audio link (optional)",
  "nowPlaying": "🎧 Now playing",
  "sendSongBtn": "Send song",
  "friendsTitle": "👥 Friends",
  "tabMyList": "My list",
  "tabRequests": "📨 Requests",
  "tabFind": "🔎 Find people",
  "requestsRecvd": "📨 Requests you've received",
  "findPeopleTitle": "🔎 Find new people",
  "searchPh": "Type a name or username (min 2 letters)…",
  "searchHint": "Start typing a name.",
  "acceptBtn": "Accept",
  "declineBtn": "Decline",
  "removeBtn": "Remove",
  "profileTab": "Profile",
  "timelineTab": "📜 Timeline",
  "postsTab": "📝 Posts",
  "editTab": "✏️ Edit",
  "detailsHeading": "👤 Details",
  "storyHeading": "📖 My story",
  "hobbiesHeading": "✨ Hobbies",
  "favsHeading": "⭐ Favourites",
  "editProfileHeading": "✏️ Edit your profile",
  "saveProfileBtn": "Save",
  "messageBtn": "💬 Message",
  "addFriendBtn": "➕ Add friend",
  "addFriendPageTitle": "➕ Add Friend",
  "sendRequestBtn": "➕ Send Friend Request",
  "alreadyFriendsMsg": "✓ Already friends",
  "requestPendingMsg": "⏳ Request already sent",
  "requestReceivedMsg": "📨 They've sent you a request",
  "viewFullProfileBtn": "View full profile",
  "backLink": "← Back",
  "suggestedTitle": "✨ Suggested for you",
  "spotifyHint": "Paste a Spotify song link — it'll play right here in the chat.",
  "playlistBtn": "🎧 Playlist",
  "playlistTitle": "🎧 Songs in this chat",
  "dedicationModalTitle": "💌 Spotify Dedication",
  "spotifyConnectingMsg": "💌 Connecting to Spotify…",
  "noSongs": "No songs shared in this chat yet."
 }
};

  // Purani key 'lovewayLanguage' se migrate karo, ab sirf 'loveway_lang'
  try {
    var old = localStorage.getItem('lovewayLanguage');
    if (old && !localStorage.getItem('loveway_lang')) localStorage.setItem('loveway_lang', old);
  } catch (e) {}

  window.LW_CURRENT = (function () {
    try { return localStorage.getItem('loveway_lang') || 'en'; } catch (e) { return 'en'; }
  })();

  /* HTML lang attribute ke liye sahi code */
  var LANG_HTML = { braj: 'hi', raj: 'raj', bho: 'bho', hyd: 'hi', hi: 'hi', mr: 'mr', en: 'en' };

  window.t = function (k) {
    var d = window.LW_LANG[window.LW_CURRENT];
    if (d && Object.prototype.hasOwnProperty.call(d, k)) return d[k];
    if (Object.prototype.hasOwnProperty.call(window.LW_LANG.en, k)) return window.LW_LANG.en[k];
    return k;
  };

  window.applyLanguage = function () {
    var cur = window.LW_CURRENT;
    document.documentElement.lang = LANG_HTML[cur] || cur;
    /* Jab kisi key ka translation kahin nahi hota, t() wahi key wapas
       kar deta hai. Pehle wo seedha laga di jaati thi — isliye screen par
       "dashboardTab", "storeTab" jaise raw naam dikhne lagte the aur HTML
       me likha hua asli text mit jaata tha. Ab translation na mile to
       HTML ka apna text hi rehne dete hain. */
    function translated(key) {
      var v = window.t(key);
      return (v && v !== key) ? v : null;
    }
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var v = translated(el.dataset.i18n);
      if (v) el.textContent = v;
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      var v = translated(el.dataset.i18nPlaceholder);
      if (v) el.placeholder = v;
    });
    document.querySelectorAll('[data-i18n-title]').forEach(function (el) {
      var v = translated(el.dataset.i18nTitle);
      if (v) el.title = v;
    });
    document.querySelectorAll('.lang-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.lang === cur);
    });
    document.querySelectorAll('select.lw-lang-select, #language, #languageMain, #languageSelect')
      .forEach(function (s) { if (s.querySelector('option[value="' + cur + '"]')) s.value = cur; });
    // page ka apna translator bhi chalao (dashboard / settings)
    if (typeof window.applyLang === 'function') { try { window.applyLang(); } catch (e) {} }
    document.dispatchEvent(new CustomEvent('lw:language', { detail: cur }));
  };

  window.setLanguage = function (lang) {
    // Bhasha ki file abhi aayi hi na ho (ab har bhasha alag file me hai).
    // Pehle sirf `return` kar dete the — us soorat me language switch
    // chup-chaap kuch nahi karta.
    if (!window.LW_LANG[lang] && !isKnownLang(lang)) return;
    window.LW_CURRENT = lang;
    try {
      localStorage.setItem('loveway_lang', lang);
      localStorage.setItem('lovewayLanguage', lang); // dashboard/settings backward-compat
    } catch (e) {}
    if (window.LW_LANG[lang]) { window.applyLanguage(); return; }
    loadLangFile(lang, function () { window.applyLanguage(); });
  };

  /* Marketing pages apna hi translation engine use karte hain aur
     Braj ko 'br' / 'brij' kehte hain. Ye do helpers language choice
     ko poore site me ek jaisa rakhte hain. */
  function canonicalLang(code) {
    code = String(code || '').toLowerCase();
    if (code === 'br' || code === 'brij' || code === 'braj') return 'braj';
    if (code === 'raj' || code === 'mar' || code === 'marwari') return 'raj';
    if (code === 'bho' || code === 'bh' || code === 'bhoj') return 'bho';
    if (code === 'hyd' || code === 'dakhini' || code === 'dk') return 'hyd';
    // LW_LANG me na hona ab sirf "abhi load nahi hui" ho sakta hai —
    // isliye asli list (LW_LANGS) dekho, warna har doosri bhasha 'en' ban jaati
    return isKnownLang(code) ? code : 'en';
  }

  // page ka apna Braj code de do, wapas usi page ka code milega
  function isKnownLang(code) {
    var list = window.LW_LANGS || [];
    for (var i = 0; i < list.length; i++) if (list[i].code === code) return true;
    return false;
  }

  // ek hi bhasha ki file do baar na aaye
  var _langLoading = {};
  function loadLangFile(code, done) {
    if (window.LW_LANG[code]) { done(); return; }
    if (_langLoading[code]) { _langLoading[code].push(done); return; }
    _langLoading[code] = [done];
    var el = document.createElement('script');
    el.src = 'lw-lang-' + encodeURIComponent(code) + '.js?v=1';
    el.onload = el.onerror = function () {
      var cbs = _langLoading[code] || [];
      delete _langLoading[code];
      cbs.forEach(function (f) { try { f(); } catch (e) {} });
    };
    document.head.appendChild(el);
  }

  window.LW_langFor = function (brajVariant) {
    return window.LW_CURRENT === 'braj' ? (brajVariant || 'braj') : window.LW_CURRENT;
  };

  /* nayi bhaashaayein: kaunsi available hain */
  window.LW_LANGS = [{"code": "en", "label": "English"}, {"code": "hi", "label": "हिंदी"}, {"code": "braj", "label": "ब्रज"}, {"code": "raj", "label": "राजस्थानी"}, {"code": "bho", "label": "भोजपुरी"}, {"code": "hyd", "label": "हैदराबादी"}, {"code": "mr", "label": "मराठी"}, {"code": "ta", "label": "தமிழ்"}, {"code": "te", "label": "తెలుగు"}, {"code": "bn", "label": "বাংলা"}, {"code": "pa", "label": "ਪੰਜਾਬੀ"}, {"code": "gu", "label": "ગુજરાતી"}];

  /* ---------- chuni hui bhasha hi load karo ----------
     Pehle saari 12 bhaashaayein isi file me thin — matlab har page par
     ~450KB translations, jinme se 11 kabhi padhi hi nahi jaati thin.
     Ab sirf English yahan hai (fallback ke liye, t() isi par girta hai)
     aur baaki har bhasha apni alag file me.

     document.write jaan-boojh kar: lw-core.js khud ek blocking script hai
     (head me, bina defer/async), isliye ye tag parser ke theek aage lagta
     hai aur DOMContentLoaded se PEHLE chal jaata hai. Isse translation
     bina jhalak ke lagta hai. Baad me inject karne par har page par
     English se Hindi ka flash dikhta — 29 page wali site me wo har
     navigation par dikhta. */
  (function () {
    var code = window.LW_CURRENT;
    if (!code || code === 'en' || window.LW_LANG[code]) return;

    var me = document.currentScript;
    var base = (me && me.src) ? me.src.replace(/[^/]*$/, '') : '';
    var url = base + 'lw-lang-' + encodeURIComponent(code) + '.js?v=1';

    if (document.readyState === 'loading') {
      // parser abhi chal raha hai — sync load safe hai
      document.write('<scr' + 'ipt src="' + url + '"><\/scr' + 'ipt>');
    } else {
      // page pehle hi ban chuka (koi page lw-core.js der se load karta ho) —
      // yahan document.write poora document mita dega, isliye kabhi nahi.
      var el = document.createElement('script');
      el.src = url;
      el.onload = function () { if (window.applyLanguage) window.applyLanguage(); };
      document.head.appendChild(el);
    }
  })();


  // page ne language badli — canonical key me yaad rakh lo (re-render nahi)
  window.LW_rememberLang = function (code) {
    window.LW_CURRENT = canonicalLang(code);
    try {
      localStorage.setItem('loveway_lang', window.LW_CURRENT);
      localStorage.setItem('lovewayLanguage', window.LW_CURRENT);
      localStorage.setItem('loveway_language', code);
    } catch (e) {}
  };

  /* ---------- 4. Helpers ---------- */
  function pageUrl(name) { return new URL(name, window.location.href).href; }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // 9876543210 / 919876543210 / +91 98765 43210  ->  +919876543210
  function normalizeMobile(m) {
    var d = String(m || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.length > 10 && d.indexOf('91') === 0) d = d.slice(d.length - 10);
    if (d.length === 10) return '+91' + d;
    return '+' + d;
  }

  function alertBox(msg, type) {
    var box = document.getElementById('alertBox');
    if (!box) { console.log('[Loveway]', type || '', msg); return; }
    box.className = 'alert ' + (type || 'info');
    box.innerHTML = msg;
    box.style.display = 'block';
  }

  function hideAlert() {
    var box = document.getElementById('alertBox');
    if (box) box.style.display = 'none';
  }

  function errText(e) {
    if (!e) return window.t('serverError');
    return e.message || e.error_description || String(e);
  }

  /* ---------- 5. Auth ---------- */
  var PROFILE_COLS =
    'id, full_name, username, email, mobile, address, city, bio, gender, dob, avatar_url, status, is_admin, created_at,' +
    ' profession, relationship_status, partner_id, story, favourites, hobbies, cover_url, pincode, latitude, longitude, updated_at,' +
    ' pinned_spotify_track_id, pinned_song_title, pinned_song_artist, pinned_song_url,' +
    // `preferences` yahan se chhoot gaya tha — isliye Settings ke toggles
    // save to ho jaate the par page kholne par kabhi wapas nahi dikhte the,
    // aur Dashboard wale widget switches ka koi asar hi nahi hota tha.
    ' preferences';

  function getSession() {
    if (!sb) return Promise.resolve(null);
    return sb.auth.getSession().then(function (r) {
      return (r && r.data && r.data.session) || null;
    }).catch(function () { return null; });
  }

  function getUser() {
    return getSession().then(function (s) { return s ? s.user : null; });
  }

  // user_metadata se ek "fallback profile" bana do — jab DB se row
  // na mile tab bhi routing chalti rahe (page atakna nahi chahiye).
  function seedFromUser(u) {
    var meta = (u && u.user_metadata) || {};
    return {
      id: u ? u.id : null,
      email: (u && u.email) || null,
      full_name: meta.full_name || meta.name || null,
      avatar_url: meta.avatar_url || meta.picture || null,
      mobile: (u && u.phone) ? normalizeMobile(u.phone)
                             : (meta.mobile ? normalizeMobile(meta.mobile) : null),
      username: meta.username || null,
      status: 'approved',
      is_admin: false,
      _fallback: true
    };
  }

  // profile laao; agar OAuth / signup ke baad row nahi bani to bana do.
  // Ye function KABHI reject nahi hota — warna redirect ruk jaata hai.
  function getProfile() {
    if (!sb) return Promise.resolve(null);
    return getUser().then(function (u) {
      if (!u) return null;

      return sb.from('profiles').select(PROFILE_COLS).eq('id', u.id).maybeSingle()
        .then(function (r) {
          if (r && r.data) return r.data;
          if (r && r.error) console.warn('[Loveway] profile select:', r.error.message);

          // row nahi hai (trigger nahi chala / OAuth) -> bana do
          var seed = seedFromUser(u);
          delete seed._fallback;
          return sb.from('profiles').insert(seed).select(PROFILE_COLS).maybeSingle()
            .then(function (r2) {
              if (r2 && r2.data) return r2.data;
              if (r2 && r2.error) console.warn('[Loveway] profile insert:', r2.error.message);
              // insert bhi fail (duplicate/RLS) -> dobara padhne ki koshish
              return sb.from('profiles').select(PROFILE_COLS).eq('id', u.id).maybeSingle()
                .then(function (r3) { return (r3 && r3.data) || seedFromUser(u); })
                .catch(function () { return seedFromUser(u); });
            })
            .catch(function () { return seedFromUser(u); });
        })
        .catch(function (e) {
          console.warn('[Loveway] getProfile:', e && e.message);
          return seedFromUser(u);
        });
    }).catch(function (e) {
      console.warn('[Loveway] getUser:', e && e.message);
      return null;
    });
  }

  /* ---------- Navigation (atakne se bachne ke liye) ---------- */
  // ek hi jagah se redirect. replace() history clean rakhta hai;
  // agar kisi wajah se replace block ho jaaye to href fallback.
  function go(page) {
    var url = pageUrl(page);
    try { window.location.replace(url); } catch (e) { window.location.href = url; }
    setTimeout(function () {
      if (window.location.href !== url) window.location.href = url;
    }, 400);
  }

  // email verify pending hai?
  function needsEmailVerify(user) {
    if (!user) return false;
    return !(user.email_confirmed_at || user.confirmed_at);
  }

  // Signup ka confirmation email dobara bhejo (6-digit code + link).
  function resendSignupOtp(email) {
    if (!sb) return Promise.resolve({ error: { message: 'config.js set nahi hai.' } });
    if (sb.auth.resend) {
      return sb.auth.resend({
        type: 'signup',
        email: email,
        options: { emailRedirectTo: pageUrl('callback.html') }
      });
    }
    // purana supabase-js
    return sb.auth.signInWithOtp({
      email: email,
      options: { shouldCreateUser: false, emailRedirectTo: pageUrl('callback.html') }
    });
  }

  // Email ka 6-digit code verify karo. Supabase token ka "type"
  // signup / email / magiclink ho sakta hai — teeno try karte hain.
  function verifyEmailOtp(email, token) {
    var types = ['signup', 'email', 'magiclink'];
    var lastErr = null;
    var i = 0;
    function attempt() {
      if (i >= types.length) return Promise.resolve({ error: lastErr });
      var type = types[i++];
      return sb.auth.verifyOtp({ email: email, token: token, type: type })
        .then(function (r) {
          if (!r.error) return r;
          lastErr = r.error;
          return attempt();
        })
        .catch(function (e) { lastErr = e; return attempt(); });
    }
    return attempt();
  }

  // Android app (Capacitor) ke andar hain ya normal browser mein?
  /* Sirf window.Capacitor par bharosa karna kaafi nahi — bridge WebView khud
     inject karta hai aur page uske taiyaar hone se pehle bhi chal sakta hai.
     Aisa ho to app apne hi origin (https://localhost) par redirect bhej deta
     hai, aur login ke baad "Web page not available" aata hai. App ka origin
     hi doosri pehchan hai: Android https://localhost (bina port), iOS
     capacitor://. Local dev port ke saath chalta hai, isliye wo bacha rehta
     hai. Same logic lw-spotify.js me bhi hai. */
  function isNativeApp() {
    if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
      return true;
    }
    if (location.protocol === 'capacitor:') return true;
    return location.hostname === 'localhost' && !location.port;
  }

  // custom scheme jispe OAuth provider wapas redirect karega — Android manifest
  // mein isi scheme/host ka intent-filter registered hai (MainActivity)
  var NATIVE_OAUTH_REDIRECT = 'com.loveway.app://callback';

  // Google / Spotify
  function oauth(provider) {
    if (!sb) { alertBox('config.js set nahi hai.', 'error'); return Promise.resolve(); }
    var native = isNativeApp();
    var opts = {
      redirectTo: native ? NATIVE_OAUTH_REDIRECT : pageUrl('callback.html'),
      skipBrowserRedirect: native   // app ke andar se khud Browser plugin se kholenge
    };
    if (provider === 'google') opts.queryParams = { prompt: 'select_account' };
    if (provider === 'spotify') opts.scopes = 'user-read-email playlist-read-private playlist-read-collaborative user-library-read';
    // callback.html isse pehchanta hai ki agar sign-in fail ho to Spotify-specific
    // hint dikhaye (Development Mode allowlist wali baat samjhaane ke liye)
    try { sessionStorage.setItem('lw_last_oauth_provider', provider); } catch (e) {}
    return sb.auth.signInWithOAuth({ provider: provider, options: opts })
      .then(function (r) {
        if (r.error) { alertBox('❌ ' + errText(r.error), 'error'); return; }
        // web par supabase-js khud window.location redirect kar deta hai.
        // App ke andar hum khud in-app browser tab kholte hain (Chrome poori
        // tarah se alag na khule, aur wapas aane par app hi pakde).
        if (native && r.data && r.data.url && window.Capacitor.Plugins.Browser) {
          window.Capacitor.Plugins.Browser.open({ url: r.data.url });
        }
      });
  }

  /* Android ka hardware/gesture back button.
     Bina iske WebView me back dabate hi app band ho jaati hai — jo
     Android par bahut kharab lagta hai. Behaviour Facebook Lite jaisa:
       modal khula ho      -> modal band
       history me peechhe   -> peechhe
       dashboard nahi ho    -> dashboard
       dashboard par ho     -> do baar dabao to app band */
  if (isNativeApp() && window.Capacitor.Plugins.App) {
    var lastBack = 0;
    window.Capacitor.Plugins.App.addListener('backButton', function (e) {
      var open = document.querySelector('.modal-bg.open, .rail-sheet-overlay.open');
      if (open) { open.classList.remove('open'); return; }

      if (e && e.canGoBack) { window.history.back(); return; }

      var page = (location.pathname.split('/').pop() || 'index.html');
      if (page !== 'dashboard.html' && page !== 'login.html' && page !== 'index.html') {
        window.location.href = pageUrl('dashboard.html');
        return;
      }

      var now = Date.now();
      if (now - lastBack < 2000) {
        window.Capacitor.Plugins.App.exitApp();
      } else {
        lastBack = now;
        if (window.LWApp && window.LWApp.toast) window.LWApp.toast('Band karne ke liye dobara back dabao');
      }
    });
  }

  // App ke andar OAuth complete hone par is custom scheme par wapas aata hai —
  // usi query/hash ke saath callback.html khol do (wahi normal web flow jaisa
  // kaam karega, kyunki PKCE ka code_verifier isi app ke localStorage mein pehle
  // se store ho chuka tha jab signInWithOAuth call hua tha).
  if (isNativeApp() && window.Capacitor.Plugins.App) {
    window.Capacitor.Plugins.App.addListener('appUrlOpen', function (data) {
      var url = data && data.url || '';
      if (url.indexOf(NATIVE_OAUTH_REDIRECT) !== 0) return;
      if (window.Capacitor.Plugins.Browser) {
        try { window.Capacitor.Plugins.Browser.close(); } catch (e) {}
      }
      var rest = url.slice(NATIVE_OAUTH_REDIRECT.length);   // '?code=...' ya '#access_token=...'
      window.location.href = pageUrl('callback.html') + rest;
    });
  }

  // chat mein "Spotify se dedication" ke liye — Spotify login se mila provider_token
  // (~1 ghante tak valid) seedha browser se Spotify Web API call karne ke liye.
  function spotifyToken() {
    return getSession().then(function (s) { return (s && s.provider_token) || null; });
  }

  function spotifyApi(path) {
    return spotifyToken().then(function (tok) {
      if (!tok) return { error: 'no-token' };
      return fetch('https://api.spotify.com/v1' + path, { headers: { Authorization: 'Bearer ' + tok } })
        .then(function (r) {
          if (!r.ok) {
            return r.json().catch(function () { return {}; }).then(function (j) {
              return { error: (j.error && j.error.message) || ('HTTP ' + r.status), status: r.status };
            });
          }
          return r.json().then(function (j) { return { data: j }; });
        })
        .catch(function (e) { return { error: e.message || 'network error' }; });
    });
  }

  // login = email | username | mobile  ->  email nikaalo, phir password se login
  function resolveEmail(login) {
    var v = String(login || '').trim();
    if (!v) return Promise.resolve('');
    if (v.indexOf('@') > 0) return Promise.resolve(v.toLowerCase());
    return sb.rpc('lw_login_email', { p_login: v }).then(function (r) {
      return (r && r.data) || '';
    }).catch(function () { return ''; });
  }

  function signInPassword(login, password) {
    return resolveEmail(login).then(function (email) {
      if (!email) {
        return { data: null, notFound: true, error: { message: 'Invalid login or password' } };
      }
      return sb.auth.signInWithPassword({ email: email, password: password });
    });
  }

  function logout() {
    var done = function () {
      try {
        localStorage.removeItem('loveway_session');
        localStorage.removeItem('loveway_user');
      } catch (e) {}
      window.location.href = pageUrl('login.html');
    };
    if (!sb) return done();
    return sb.auth.signOut().then(done, done);
  }

  /* ---------- 6. Routing ---------- */
  // profile ke hisaab se agla page
  // NOTE: admin approval step hata diya gaya hai. Naya signup seedha
  // approved hota hai. Sirf 'rejected' (admin ne block kiya) user ko
  // roka jaata hai — wo blocked.html par jaata hai.
  function targetFor(profile) {
    if (!profile) return 'login.html';
    if (!profile.username || !profile.mobile) return 'complete-profile.html';
    if (profile.status === 'rejected') return 'blocked.html';
    // Admin bhi pehle Loveway hi kholta hai. Pehle yahan admin ko seedha
    // admin.html par bhej diya jaata tha — matlab admin apne hi account se
    // feed, chat, store, kuch bhi use nahi kar paata tha. Control Center
    // ab Settings aur header ke 🛡️ button se ek click door hai.
    return 'dashboard.html';
  }

  function routeAfterLogin() {
    return getProfile().then(function (p) {
      go(targetFor(p));
    }).catch(function () {
      go('dashboard.html');   // profile na mile to bhi aage bhejo
    });
  }

  // pages ko guard karo. opts: { admin:true, allowBlocked:true }
  // (allowPending purana naam hai — compatibility ke liye chal raha hai)
  function requireAuth(opts) {
    opts = opts || {};
    var allowBlocked = opts.allowBlocked || opts.allowPending;
    return getProfile().then(function (p) {
      if (!p) { go('login.html'); return null; }
      if (!p.username || !p.mobile) {
        go('complete-profile.html'); return null;
      }
      if (!allowBlocked && p.status === 'rejected') {
        go('blocked.html');
        return null;
      }
      if (opts.admin && !p.is_admin) {
        go('dashboard.html'); return null;
      }
      window.LW.profile = p;
      return p;
    });
  }

  // marketing pages ka nav: logged-in ho to Dashboard/Logout dikhao
  function paintNav() {
    getProfile().then(function (p) {
      var isIn = !!p;
      document.querySelectorAll('[data-lw-when="out"]').forEach(function (el) {
        el.style.display = isIn ? 'none' : '';
      });
      document.querySelectorAll('[data-lw-when="in"]').forEach(function (el) {
        el.style.display = isIn ? '' : 'none';
      });
      if (isIn) {
        document.querySelectorAll('[data-lw-target]').forEach(function (el) {
          el.setAttribute('href', pageUrl(targetFor(p)));
        });
        document.querySelectorAll('[data-lw-name]').forEach(function (el) {
          el.textContent = p.full_name || p.username || '';
        });
      }
    });
  }

  /* ---------- 7. Export ---------- */
  window.LW = {
    sb: sb,
    cfg: cfg,
    configOk: configOk,
    profile: null,
    pageUrl: pageUrl,
    go: go,
    needsEmailVerify: needsEmailVerify,
    resendSignupOtp: resendSignupOtp,
    verifyEmailOtp: verifyEmailOtp,
    escapeHtml: escapeHtml,
    normalizeMobile: normalizeMobile,
    alert: alertBox,
    hideAlert: hideAlert,
    errText: errText,
    getSession: getSession,
    getUser: getUser,
    getProfile: getProfile,
    oauth: oauth,
    google: function (e) { if (e) e.preventDefault(); return oauth('google'); },
    spotify: function (e) { if (e) e.preventDefault(); return oauth('spotify'); },
    spotifyToken: spotifyToken,
    spotifyApi: spotifyApi,
    resolveEmail: resolveEmail,
    signInPassword: signInPassword,
    logout: logout,
    targetFor: targetFor,
    routeAfterLogin: routeAfterLogin,
    requireAuth: requireAuth,
    paintNav: paintNav
  };

  // purane inline handlers ke liye aliases
  window.googleLogin = window.LW.google;
  if (typeof window.logout !== 'function') window.logout = window.LW.logout;

  document.addEventListener('DOMContentLoaded', function () {
    window.applyLanguage();
    if (document.querySelector('[data-lw-when]')) paintNav();
  });
})();
