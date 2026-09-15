# Zircon Flow

​Project Name: Zircon Journey (تطبيق رحلة سن الزركون)

Target Language: Full Arabic Interface (RTL Support)

​Core Objective:

Create a high-end, professional workflow management system for "Zircon CAD CAM Center". The application must be in Arabic, supporting Right-to-Left (RTL) layout, with a luxury medical aesthetic using Deep Brown, Elegant Beige, and Metallic Gold accents.

​System Architecture & User Roles:

​Doctor’s Portal (Customized): Each doctor must have a dedicated private dashboard. They should only see their own cases, patient history, and status updates.

​CAD/CAM Designer Page: A central hub to receive 3D scans from doctors, upload design files, and communicate design notes.

​Lab Technician Page: A workspace to receive final designs, manage the zircon milling/carving process, and mark orders as "Completed".

​Secretary Dashboard (Multi-Branch): A split interface for "Sana'a Branch" and "Ibb Branch". They manage logistics, receive notifications of finished cases, and coordinate with patients.

​Admin/Management Panel: Total oversight of all branches, doctors, and stages. Includes analytics, performance reports, and an "Archive" for all completed journeys.

​The "Zircon Journey" Workflow Logic:

​Step 1: Doctor uploads patient data and 3D scans.

​Step 2: Notification sent to Designer. Designer uploads the digital design.

​Step 3: Notification sent to Technician. Technician downloads files, carves the zircon, and updates status to "Ready".

​Step 4: Secretary (based on branch) receives a list of ready cases to contact patients for delivery.

​Detailed Features per Role:

​Advanced File Handling: Tools to upload/download heavy 3D files (STL/OBJ) and high-res images.

​Integrated Communication: A real-time chat/comment tool within each case card for instant follow-ups between the doctor, designer, and lab.

​Smart Notifications: Instant push notifications and in-app alerts for every transition in the tooth journey.

​Patient Database: A searchable archive for all patients and their specific zircon cases.

​Technical & UI Implementation:

​Language: The UI text, buttons, and labels must be in professional Arabic.

​Login Logic: A smart login screen that redirects each user to their specific dashboard based on their role and branch.

​Visual Style: Use card-based layouts, gold-colored progress bars for the "Journey" status, and a clean, high-contrast typography.

​Responsiveness: Ensure the app works perfectly on both Desktop (for the lab) and Mobile (for doctors on the go).

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://zircon-journey.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/b35291ce-dece-4302-89c8-dddfbc70b8d1).

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
