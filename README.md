# Quiet Focus

Build a Minimal, Premium Focus Timer App

Design and build a polished, mobile-first focus timer application. The app should help users concentrate on their work, study, or personal tasks without unnecessary distractions.

The experience should feel peaceful, lightweight, modern, and satisfying to use.

Important: This is a focus timer, NOT an AI companion, meditation app, or productivity dashboard. Do not implement chatbots, breathing exercises, or unnecessary wellness features.

1. Design Direction

Create a premium minimalist interface inspired by modern wellness and productivity applications.

Visual identity:

- Background: warm off-white (#F5F5F5).

- Primary surface: white (#FFFFFF).

- Primary text: almost-black (#18181B).

- Secondary text: soft grey (#929292).

- Primary accent: warm orange (#FF8A3D).

- Secondary accent: subtle coral/pink (#F2688A).

- Soft pastel colors can be used sparingly.

- Typography: Inter or a similar clean geometric sans-serif.

Design principles:

- Mobile-first, portrait orientation.

- iPhone-style interface with rounded corners.

- Generous whitespace.

- Large, readable typography.

- Minimal shadows and subtle borders.

- Rounded cards (18–24px).

- Pill-shaped buttons.

- No excessive gradients, decorations, or animations.

- Avoid generic AI-generated dashboard aesthetics.

The interface should feel carefully designed, not crowded.

2. Main Screen — Focus Timer

This is the most important screen. Make it exceptionally clean.

Top section:

- Small app logo and name.

- Minimal settings icon on the right.

- A subtle greeting such as "Ready to focus?"

Main timer section:

- Large circular timer in the center of the screen.

- Display the remaining time in a large, bold font.

- A thin circular progress indicator surrounding the timer.

- Use a warm orange accent for the progress ring.

- Show a small status label above the timer: "FOCUS SESSION".

- Below the timer, show a subtle motivational message such as "One thing at a time."

Duration selection:

Provide three quick-select options:

- 25 minutes

- 50 minutes

- 90 minutes

Also provide an option to set a custom duration.

Selected duration should have a subtle orange background or border.

Primary action:

- Large, full-width pill-shaped black button.

- Label: "Start focusing".

- When active, change the button to "Pause".

- Provide a separate, less prominent reset action.

3. Active Focus Session

When the user starts a session:

- Start the countdown immediately.

- Animate the circular progress ring smoothly.

- Update the remaining time every second.

- Show "Stay focused" as the main status.

- Display the selected session duration.

- Keep the interface extremely minimal.

- Provide Pause and Resume functionality.

- Provide an End Session action with confirmation.

Do not show unnecessary information during an active session.

The timer must continue correctly while the interface is active. Avoid decorative animations that distract the user.

4. Session Completion Screen

When the countdown reaches zero, display a beautiful but minimal completion screen.

Include:

- A subtle celebratory animation.

- Large headline: "Session completed!"

- Supporting message: "Great work. You made time for what matters."

- Total focused time.

- A simple completion indicator.

Primary button: "Start another session".

Secondary action: "Back to home".

Keep the celebration subtle and satisfying, not overly playful.

5. Simple Progress & Statistics

Include a lightweight statistics section accessible from the home screen.

Show only essential information:

- Total focus time today.

- Number of completed sessions.

- Current daily streak.

- Weekly focus time.

Use clean typography and simple progress indicators.

Avoid complicated charts, large dashboards, and unnecessary metrics.

6. Settings

Provide a minimal settings screen containing:

- Default focus duration.

- Custom timer duration.

- Sound notification toggle.

- Session completion notification.

- Light/dark appearance preference.

- Reset statistics option.

Keep settings simple and easy to understand.

7. Functional Requirements

This must be a functional application, not just a static UI prototype.

Implement:

1. Working countdown timer.

2. Start, pause, resume, and reset.

3. Preset focus durations.

4. Custom duration selection.

5. Accurate session completion detection.

6. Session history and daily statistics.

7. Persistent storage so completed sessions survive page refreshes.

8. Proper handling of timer state when navigating between screens.

9. Responsive layouts for mobile and desktop.

Use local storage initially. Do not require authentication or a backend for the first version.

Use reliable time calculations rather than relying solely on repeated one-second intervals, so the countdown does not drift.

8. Navigation

Keep navigation minimal.

Use only two primary destinations:

- Focus — Main timer.

- Progress — Focus statistics.

Settings should be accessible through a small icon rather than another major navigation destination.

9. Motion & Microinteractions

- Smooth circular progress animation.

- Gentle transitions between screens.

- Subtle button press feedback.

- Soft completion animation.

- No distracting bouncing elements.

- No excessive background animations.

10. Development Instructions

- Build the actual application, not just a visual mockup.

- Prioritize the main focus timer experience.

- Create reusable components.

- Maintain consistent spacing, typography, and colors.

- Use clean, maintainable code.

- Ensure all buttons and controls work.

- Use sensible defaults instead of adding unnecessary features.

Final design goal:

The app should feel like a quiet space where someone can open their phone, start a timer, and immediately get to work.

Think minimal, premium, peaceful, and purposeful.

Every element must have a reason to exist.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/96253708-01f5-4afd-aed6-6cd5b157a520).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
