# CNEAv5 Neural Interfacing Platform - User Guide

## Table of Contents

- [1. Getting Started](#1-getting-started)
  - [1.1 Accessing the Application](#11-accessing-the-application)
  - [1.2 Login](#12-login)
  - [1.3 User Roles](#13-user-roles)
- [2. Navigation Overview](#2-navigation-overview)
  - [2.1 Layout Description](#21-layout-description)
  - [2.2 Sidebar Navigation Items](#22-sidebar-navigation-items)
- [3. Dashboard Page](#3-dashboard-page)
  - [3.1 Overview](#31-overview)
  - [3.2 Components](#32-components)
  - [3.3 How to Use](#33-how-to-use)
- [4. Visualization Page](#4-visualization-page)
  - [4.1 Overview](#41-overview)
  - [4.2 Visualization Types](#42-visualization-types)
  - [4.3 Toolbar Controls](#43-toolbar-controls)
  - [4.4 Step-by-Step Usage](#44-step-by-step-usage)
- [5. Controls Page](#5-controls-page)
  - [5.1 Overview](#51-overview)
  - [5.2 Configuration Tabs](#52-configuration-tabs)
  - [5.3 Presets](#53-presets)
  - [5.4 Applying Configuration](#54-applying-configuration)
  - [5.5 Stimulation Channel Selector](#55-stimulation-channel-selector)
- [6. Recording Browser](#6-recording-browser)
  - [6.1 Overview](#61-overview)
  - [6.2 Features](#62-features)
  - [6.3 Step-by-Step](#63-step-by-step)
- [7. Experiments](#7-experiments)
  - [7.1 Overview](#71-overview)
  - [7.2 Features](#72-features)
  - [7.3 Step-by-Step](#73-step-by-step)
- [8. AI Assistant (Chat Panel)](#8-ai-assistant-chat-panel)
  - [8.1 Overview](#81-overview)
  - [8.2 Opening the Chat Panel](#82-opening-the-chat-panel)
  - [8.3 Capabilities](#83-capabilities)
  - [8.4 Using the Chat](#84-using-the-chat)
- [9. Notifications](#9-notifications)
  - [9.1 Overview](#91-overview)
  - [9.2 Notification Types](#92-notification-types)
  - [9.3 Viewing Notifications](#93-viewing-notifications)
- [10. Settings](#10-settings)
  - [10.1 Available Settings](#101-available-settings)
- [11. Header and Status Bar Guide](#11-header-and-status-bar-guide)
  - [11.1 Header Elements](#111-header-elements)
  - [11.2 Status Bar (Desktop Only)](#112-status-bar-desktop-only)
- [12. Mobile Usage](#12-mobile-usage)
  - [12.1 Navigation](#121-navigation)
  - [12.2 Responsive Behavior](#122-responsive-behavior)
  - [12.3 Tips for Mobile](#123-tips-for-mobile)
- [13. Troubleshooting](#13-troubleshooting)
  - [13.1 Common Issues](#131-common-issues)
  - [13.2 Getting Help](#132-getting-help)

---

## 1. Getting Started

### 1.1 Accessing the Application

The CNEAv5 Neural Interfacing Platform is a web-based application accessible from any modern browser.

1. Open your web browser and navigate to:
   ```
   https://demo.eminencetechsolutions.com:3025
   ```
2. The login page will load automatically.

**Supported Browsers:**

| Browser | Minimum Version |
|---------|----------------|
| Google Chrome | Latest stable release |
| Mozilla Firefox | Latest stable release |
| Apple Safari | Latest stable release |
| Microsoft Edge | Latest stable release |

**Mobile Access:** The platform is fully responsive and functions on smartphones and tablets. All core features are available on mobile devices, with layout adjustments optimized for smaller screens.

---

### 1.2 Login

1. On the login page, enter your **email address** in the email field.
2. Enter your **password** in the password field.
3. Click the **"Sign In"** button.
4. If authentication succeeds, you will be redirected to the **Dashboard** page.
5. If you do not have an account, contact your system administrator to request credentials.

> **Note:** Sessions will expire after a period of inactivity. If you are redirected to the login page unexpectedly, re-enter your credentials to continue.

---

### 1.3 User Roles

The platform supports four user roles, each with distinct permissions. Your role is assigned by your administrator.

**Admin**
- Full access to all platform features
- User management (create, modify, delete user accounts)
- System-wide configuration and maintenance
- Access to all recordings, experiments, and settings

**Researcher**
- Access to recordings and recording playback
- Access to experiments (create, edit, manage)
- Full visualization capabilities
- Hardware controls and configuration
- AI assistant access for data analysis

**Operator**
- Access to recording controls (start, stop, monitor)
- Hardware configuration and FPGA parameter management
- Real-time monitoring of system health and data throughput
- Limited to operational tasks; no experiment management

**Viewer**
- Read-only access to dashboards and system status
- Read-only access to recordings (view, but not delete or modify)
- No access to hardware controls or configuration
- Suitable for observers and stakeholders

---

## 2. Navigation Overview

### 2.1 Layout Description

The platform interface is organized into five distinct regions:

**Sidebar (Left)**
The primary navigation menu is located on the left side of the screen. It displays menu items with icons and text labels. On desktop, the sidebar can be collapsed to show icons only, freeing up screen space. On mobile devices, the sidebar is hidden behind a hamburger menu icon.

**Header (Top)**
The top header bar provides at-a-glance system status and quick-access controls. From left to right, it displays: connection status, FPGA status, recording indicator with elapsed timer, notification bell, AI assistant toggle button, and user profile menu.

**Main Content (Center)**
The central area of the screen renders the active page content. This region adapts to the selected navigation item and occupies the majority of the viewport.

**Status Bar (Bottom, Desktop Only)**
A persistent status bar along the bottom of the screen displays real-time telemetry: data throughput, buffer usage, sample rate, individual agent health indicators, and the application version number. This bar is hidden on mobile devices.

**Chat Panel (Right)**
The AI assistant panel slides in from the right side of the screen when activated. It overlays the main content area and can be dismissed by clicking the close button or toggling the assistant button in the header.

---

### 2.2 Sidebar Navigation Items

The sidebar contains the following navigation items, listed from top to bottom:

| Menu Item | Icon | Description |
|-----------|------|-------------|
| Dashboard | LayoutDashboard | System overview and health monitoring |
| Visualization | Activity | Real-time neural data visualization |
| Controls | Sliders | FPGA hardware configuration and presets |
| Recordings | Database | Browse and manage recorded sessions |
| Experiments | FlaskConical | Create and manage experimental sessions |
| Settings | Settings | User preferences and system configuration |

Click any menu item to navigate to the corresponding page. The currently active page is highlighted in the sidebar.

---

## 3. Dashboard Page

### 3.1 Overview

The Dashboard is the landing page after login. It provides a comprehensive, system-wide overview of the neural interfacing platform, consolidating key metrics, status indicators, and quick-access controls into a single view.

---

### 3.2 Components

The Dashboard page contains the following components, arranged from top to bottom:

**System Status Cards**
A row of summary cards at the top of the page displaying:
- **FPGA Status** -- Whether the FPGA hardware is connected and operational
- **Agent Health** -- Aggregate health status of the distributed agent system
- **Active Channels** -- Number of electrode channels currently active (out of 4096)
- **Data Rate** -- Current data throughput from the electrode array

**Recording Status Widget**
Displays the current recording state:
- Whether a recording is active, paused, or idle
- Elapsed recording duration (hours:minutes:seconds)
- Cumulative spike count detected during the current session

**Agent Health Monitor**
A detailed status panel showing the operational state of all 7 system agents. Each agent is displayed with a color-coded indicator:
- **Green** -- Online (fully operational)
- **Amber** -- Degraded (partially functional, may require attention)
- **Red** -- Error (agent has encountered a critical failure)
- **Gray** -- Offline (agent is not running)

**Quick Actions**
A set of shortcut buttons for frequently used operations:
- **Start Recording** / **Stop Recording** -- Toggle the recording state
- **Open Visualization** -- Navigate directly to the Visualization page
- **Configure Hardware** -- Navigate directly to the Controls page

**Recent Recordings**
A table listing the most recent recording sessions, showing:
- Recording name
- Timestamp (date and time)
- Duration
- File size
- Status (completed, in-progress, failed)

**Performance Metrics**
Interactive charts displaying time-series data for:
- Data throughput (KB/s or MB/s over time)
- Latency (milliseconds)
- Buffer usage percentage

---

### 3.3 How to Use

Follow these steps when you arrive at the Dashboard:

1. **Check system health indicators** at the top of the page. Verify that the FPGA status shows "Connected" and that the active channel count matches your expected configuration.
2. **Review the Agent Health Monitor.** All seven agents should display green "Online" indicators. If any agent shows amber or red, investigate the issue before proceeding with data acquisition.
3. **Use the Quick Action buttons** to start common tasks. Click "Start Recording" to begin a new recording session, or click "Open Visualization" to view live neural data.
4. **Monitor real-time metrics** in the Performance Metrics charts section. Watch for unusual spikes in latency or drops in throughput that may indicate system issues.
5. **Review Recent Recordings** to verify that previous sessions completed successfully and to access recorded data.

---

## 4. Visualization Page

### 4.1 Overview

The Visualization page provides real-time rendering of neural data from the 4096-channel electrode array. It supports four distinct visualization types, each suited to different aspects of neural data analysis. Data streams in real-time when a recording is active; otherwise, you can load saved recordings for playback.

---

### 4.2 Visualization Types

#### 4.2.1 Spike Heatmap

The Spike Heatmap displays all 4096 channels simultaneously in a 64x64 grid layout, where each cell represents one electrode channel.

- **Color intensity** indicates the spike rate (spikes per second) for each channel.
- **Color scale:** Blue (low activity) transitions through Green and Yellow to Red (high activity).
- **Hover interaction:** Position your cursor over any cell to display a tooltip showing the exact channel number and current spike count.
- This view is ideal for identifying spatial patterns of neural activity across the entire array at a glance.

#### 4.2.2 Raster Plot

The Raster Plot provides a time-based representation of spike events across channels.

- **X-axis:** Time (scrolling left to right as new data arrives).
- **Y-axis:** Channel number (0 through 4095).
- Each **dot** on the plot represents a single detected spike event.
- This view is useful for observing temporal firing patterns, burst activity, and synchronization across channel groups.

#### 4.2.3 Frequency Spectrum

The Frequency Spectrum view performs FFT-based (Fast Fourier Transform) frequency analysis on selected channels.

- Displays the **power spectral density** across the frequency range.
- Useful for identifying **noise sources** (e.g., 50/60 Hz power line interference) and verifying signal quality.
- The frequency range is adjustable to focus on bands of interest (e.g., theta, alpha, beta, gamma).
- Multiple channels can be overlaid for comparison.

#### 4.2.4 Waveform View

The Waveform View renders raw signal traces from selected channels.

- Displays **voltage over time** for each selected channel as a continuous waveform.
- Multiple channels can be **overlaid** on the same axes for direct comparison.
- The **time window** (horizontal axis span) is adjustable to show more or less temporal context.
- The **amplitude scale** (vertical axis range) is adjustable to accommodate different signal magnitudes.

---

### 4.3 Toolbar Controls

The Visualization page toolbar provides the following controls:

**View Selector**
A set of buttons or dropdown menu to switch between the four visualization types: Heatmap, Raster, Spectrum, and Waveform. Click the desired view to switch immediately.

**Channel Selection Panel (Left Sidebar)**
A collapsible panel on the left side of the visualization area. Use it to:
- Select or deselect individual channels for display
- Select channel ranges or groups
- Search for specific channel numbers

**Settings Panel (Right Sidebar)**
A collapsible panel on the right side providing view-specific parameters:
- Color scale range and palette (Heatmap)
- Time window duration (Raster, Waveform)
- Frequency range (Spectrum)
- Amplitude scale (Waveform)
- Update rate

**Auto-scale**
Click the Auto-scale button to automatically adjust axis ranges to fit the current data. This is useful after changing channels or switching views.

**Pause / Resume**
Click Pause to freeze the display at the current moment for detailed inspection. Click Resume to return to real-time streaming. While paused, you can hover, zoom, and inspect data without it scrolling away.

**Screenshot**
Click the Screenshot button to capture the current visualization as an image file. The image is downloaded to your local machine.

---

### 4.4 Step-by-Step Usage

1. Navigate to **Visualization** from the sidebar menu.
2. Select a **view type** from the toolbar at the top of the page. The default view is the Spike Heatmap.
3. If a **recording is currently active**, data will stream into the visualization in real-time automatically.
4. Open the **Channel Selection Panel** on the left to choose which channels to display. For the Heatmap view, all 4096 channels are shown by default. For Waveform and Spectrum views, select a subset of channels for clarity.
5. Open the **Settings Panel** on the right to adjust visualization parameters such as color scale, time window, or frequency range.
6. Use **Pause** to freeze the display when you want to inspect a specific moment in detail.
7. Click **Screenshot** to save a snapshot of the current view.
8. On mobile devices, the Channel Selection and Settings panels are hidden by default. Tap the corresponding panel icons in the toolbar to expand them.

---

## 5. Controls Page

### 5.1 Overview

The Controls page allows you to configure FPGA hardware parameters that govern the electrode array's behavior. Configuration is organized into tabbed sections, and presets are available for common use cases. Changes made here directly affect the hardware operation.

---

### 5.2 Configuration Tabs

The Controls page is divided into the following tabs:

**Bias Tab**
Contains 20 bias voltage parameters organized into 6 categories:
- **Pixel Bias** -- Voltage settings for individual pixel elements on the array
- **Amplifier Bias** -- Bias currents for the on-chip amplification stage
- **Comparator Bias** -- Threshold and bias settings for spike detection comparators
- **ADC Bias** -- Analog-to-digital converter reference and bias voltages
- **Clock Bias** -- Bias parameters affecting clock generation and distribution
- **Output Bias** -- Output driver bias settings

Each parameter is presented with a slider control and a numeric input field. Adjust values by dragging the slider or typing a precise value directly.

**Clock Tab**
Configure the system clock:
- **Clock Frequency** -- Set the master clock frequency
- **Clock Divider** -- Integer divider applied to the master clock
- **Phase Settings** -- Clock phase alignment for multi-phase sampling

**TIA Tab**
Configure the Transimpedance Amplifier (TIA):
- **Gain** -- Amplifier gain setting (controls sensitivity)
- **Bandwidth** -- Amplifier bandwidth (controls frequency response)

**Gain Tab**
Select the system gain mode:
- **Low** -- Minimum gain, suitable for high-amplitude signals
- **Medium** -- Balanced gain for general-purpose recording
- **High** -- Elevated gain for low-amplitude signals
- **Ultra** -- Maximum gain for detecting very weak signals (higher noise floor)

**Stimulation Tab**
Configure electrical stimulation parameters:
- **Stimulation Voltage** -- Amplitude of the stimulation pulse
- **Pulse Width** -- Duration of each stimulation pulse
- **Frequency** -- Repetition rate of stimulation pulses
- **Channel Selection** -- Select which channels deliver stimulation (see Section 5.5)

**Pixel Tab**
Configure pixel-level settings:
- **Pixel Configuration** -- Operating mode for individual pixels
- **ROI (Region of Interest) Settings** -- Define sub-regions of the array for focused recording

---

### 5.3 Presets

Presets provide pre-configured parameter sets for common recording scenarios. To access presets:

1. Click the **"Presets"** button in the top toolbar of the Controls page.
2. A panel or dropdown will display the available presets.

**Available Presets:**

| Preset Name | Description |
|-------------|-------------|
| **Default** | Balanced settings suitable for general-purpose neural recording. Moderate gain, standard clock rate, all channels active. |
| **High Density** | Optimized for maximum channel density recording. All 4096 channels active with settings tuned for dense spatial sampling. |
| **Low Noise** | Conservative parameter values designed for noise-sensitive measurements. Lower gain, narrower bandwidth, and optimized bias settings to minimize noise floor. |
| **Stimulation** | Pre-configured for stimulation experiments. Stimulation parameters are set to safe default values with a subset of channels enabled for stimulus delivery. |

3. Click a preset name to load its values into all configuration tabs.
4. After loading a preset, you may modify individual parameters as needed to fine-tune the configuration for your specific experiment.

---

### 5.4 Applying Configuration

Follow these steps to apply a hardware configuration:

1. **Select a preset** or manually navigate through the tabs to adjust individual parameters.
2. **Use the sliders** to fine-tune each parameter value. You can also type exact values into the numeric input fields adjacent to each slider.
3. **Review computed values** displayed on screen. The interface calculates and shows derived values such as the effective ADC sampling rate, pixel readout rate, and ROI channel count based on your current settings.
4. Click the **"Apply Configuration"** button to send the configuration to the FPGA hardware.
5. A **confirmation toast notification** will appear in the corner of the screen when the settings have been successfully applied.
6. If you need to revert all changes, click the **"Reset to Default"** button to restore all parameters to their factory default values.

> **Important:** Configuration changes take effect immediately upon clicking "Apply Configuration." Ensure that you have reviewed all parameter values before applying, especially during active recordings.

---

### 5.5 Stimulation Channel Selector

The Stimulation tab includes a dedicated channel selector for choosing which channels deliver electrical stimulation:

1. Navigate to the **Stimulation** tab on the Controls page.
2. The 64 stimulation channels are displayed in a **16-column by 4-row grid**.
3. **Click individual channel cells** to toggle them on or off. An active (selected) channel appears highlighted in cyan; an inactive channel appears in its default color.
4. Click the **"All"** button to select all 64 stimulation channels simultaneously.
5. Click the **"None"** button to deselect all channels, clearing the selection entirely.
6. After selecting the desired channels, configure the stimulation parameters (voltage, pulse width, frequency) and click "Apply Configuration" to activate.

---

## 6. Recording Browser

### 6.1 Overview

The Recording Browser provides a centralized interface for browsing, searching, and managing all neural data recording sessions stored on the platform. Each recording entry contains metadata including the session name, timestamp, duration, file size, and channel count.

---

### 6.2 Features

**Search**
A search bar at the top of the page lets you filter recordings by:
- Recording name
- Date or date range
- Associated experiment name

**Sort**
Click on any column header to sort the recording list by that field:
- Date (newest or oldest first)
- Duration (longest or shortest first)
- File size (largest or smallest first)
- Channel count

**Filter**
Use the status filter to narrow results:
- **Completed** -- Recordings that finished normally
- **In-Progress** -- Recordings currently being captured
- **Failed** -- Recordings that terminated due to an error

**Export**
Download recording data in supported formats:
- **HDF5** -- Hierarchical Data Format, suitable for large-scale scientific data analysis
- **CSV** -- Comma-separated values, suitable for import into spreadsheets and simple analysis tools

**Delete**
Remove recordings from the system. This action is restricted to users with **Admin** or **Researcher** roles. Deletion is permanent.

---

### 6.3 Step-by-Step

1. Navigate to **Recordings** from the sidebar menu.
2. Use the **search bar** at the top to locate a specific recording by name, date, or experiment.
3. Click on **column headers** (Date, Duration, Size, Channels) to sort the list.
4. Use the **status filter** buttons to show only completed, in-progress, or failed recordings.
5. Click on a **recording row** to open its detail view, which displays full metadata and may offer playback or visualization options.
6. To download a recording, click the **Export** button on the recording's row or detail view and select the desired format (HDF5 or CSV).
7. To remove a recording, click the **Delete** button (available to Admin and Researcher roles only). Confirm the deletion when prompted.

---

## 7. Experiments

### 7.1 Overview

The Experiments page allows you to create and manage experimental sessions. An experiment serves as a logical container that groups related recordings together under a shared context, including a name, description, protocol notes, and status tracking.

---

### 7.2 Features

- **Create new experiments** with a name, description, and protocol parameters.
- **Associate recordings** with experiments to organize data by scientific context.
- **Track experiment status** and progress through defined lifecycle stages.
- **Add notes and annotations** to experiments for documentation purposes.
- **Filter experiments by status:** All, Active, Completed, or Archived.

---

### 7.3 Step-by-Step

1. Navigate to **Experiments** from the sidebar menu.
2. Click the **"New Experiment"** button to create a new experimental session.
3. Fill in the experiment details:
   - **Name** -- A descriptive title for the experiment
   - **Description** -- A summary of the experiment's purpose and methodology
   - **Protocol** -- Detailed protocol steps or references
4. Click **Save** or **Create** to finalize the new experiment.
5. Begin recording sessions. New recordings will be linked to the active experiment automatically, or you can manually associate recordings with an experiment.
6. Use the **status filter tabs** (All, Active, Completed, Archived) to locate specific experiments.
7. Click on an **experiment entry** to open its detail view, where you can:
   - View all associated recordings
   - Edit the experiment description or protocol
   - Add notes and annotations
   - Change the experiment status (e.g., mark as completed or archived)

---

## 8. AI Assistant (Chat Panel)

### 8.1 Overview

The CNEAv5 platform includes a built-in AI assistant that provides conversational support for data analysis, system queries, configuration guidance, and troubleshooting. The assistant uses Retrieval-Augmented Generation (RAG) to ground its responses in your actual system data and documentation.

---

### 8.2 Opening the Chat Panel

- Click the **"Assistant"** button (message icon) in the header bar.
- **On desktop:** The chat panel slides in from the right side of the screen, overlaying a portion of the main content area. You can continue to see the main content alongside the chat.
- **On mobile:** The chat panel opens as a full-screen overlay for optimal readability and input.

To close the panel, click the **X** button in the top corner of the chat panel, or click the Assistant button in the header again to toggle it closed.

---

### 8.3 Capabilities

The AI assistant can help with the following tasks:

- **Answer questions about your neural data** -- Query spike rates, channel statistics, and recording metadata.
- **Explain spike detection results** -- Describe how spikes were detected and provide context for the detection parameters.
- **Troubleshoot hardware issues** -- Diagnose common problems with FPGA connectivity, agent health, and data throughput.
- **Provide analysis recommendations** -- Suggest appropriate visualization types, filtering approaches, and analysis workflows.
- **Query recording metadata** -- Look up details about specific recordings, durations, file sizes, and associated experiments.
- **Explain system configuration** -- Describe what each configuration parameter does and recommend appropriate values for different scenarios.

---

### 8.4 Using the Chat

1. Click the **Assistant** button in the header to open the chat panel.
2. Type your question or request in the **text input field** at the bottom of the panel.
3. Press **Enter** on your keyboard or click the **Send** button to submit your message.
4. The assistant processes your query using RAG (Retrieval-Augmented Generation), retrieving relevant context from your system data before generating a response.
5. The assistant's response appears in the chat area above your message, along with any relevant data references or citations.
6. Continue the conversation by typing **follow-up questions**. The assistant maintains context within the current conversation session.
7. To close the chat panel, click the **X** button in the panel header or click the Assistant button in the header bar again.

---

## 9. Notifications

### 9.1 Overview

The notification system delivers real-time alerts about important system events. Notifications appear as a badge count on the bell icon in the header and are stored for later review.

---

### 9.2 Notification Types

**Recording Events**
- Recording started
- Recording stopped
- Recording completed successfully
- Recording failed due to error

**Agent Alerts**
- Agent came online
- Agent went offline
- Agent entered error state
- Agent status degraded

**Threshold Alerts**
- Spike rate exceeded configured threshold on one or more channels
- Signal level exceeded configured amplitude threshold
- Unusual activity patterns detected

**System Alerts**
- Storage space running low
- WebSocket connection lost or reconnected
- FPGA communication timeout
- Buffer overflow warning

---

### 9.3 Viewing Notifications

1. Locate the **bell icon** in the header bar. If there are unread notifications, a numeric badge displays the count.
2. Click the **bell icon** to open the notification dropdown panel.
3. The panel displays a list of recent notifications, ordered by most recent first.
4. **Unread notifications** are visually distinguished (e.g., bold text or highlighted background).
5. Click on a **specific notification** to view its full details or to navigate to the relevant page (e.g., clicking a recording event notification takes you to the Recording Browser).
6. Click **"Mark all read"** at the top of the notification panel to clear the unread badge count and mark all notifications as read.

---

## 10. Settings

### 10.1 Available Settings

The Settings page provides configuration options organized into the following sections:

**Profile**
- Update your display name
- Update your email address
- Change your password

**Appearance**
- Theme preferences (light mode, dark mode, or system default)
- Interface density or layout preferences

**Notifications**
- Configure which notification types you wish to receive
- Enable or disable individual alert categories (recording events, agent alerts, threshold alerts, system alerts)
- Set notification delivery preferences

**System (Admin Only)**
- Configure system-wide parameters
- Manage global thresholds and alert rules
- Storage management and data retention policies
- User account administration (create, edit, delete accounts, assign roles)

> **Note:** The System section is only visible and accessible to users with the Admin role.

---

## 11. Header and Status Bar Guide

### 11.1 Header Elements

The header bar spans the top of the application and contains the following elements, arranged from left to right:

**Connection Status**
- A **green Wi-Fi icon** indicates that all agents are connected and communicating normally.
- A **red Wi-Fi icon** indicates that one or more agents have lost connectivity. Check the Agent Health Monitor on the Dashboard for details.

**FPGA Status**
- Displays the current readiness state of the FPGA hardware (e.g., "Ready," "Configuring," "Error").

**Recording Indicator**
- When a recording is active, a **red pulsing dot** appears alongside the text **"REC"**.
- The indicator also displays the **elapsed recording duration** (HH:MM:SS format) and the **cumulative spike count**.
- When no recording is active, this area is blank or shows "Idle."

**Notification Bell**
- Click to open the notification dropdown (see Section 9.3).
- A numeric badge appears when there are unread notifications.

**Assistant Button**
- Click to toggle the AI chat panel open or closed (see Section 8.2).

**User Profile**
- Displays the logged-in user's name or avatar.
- Click to open a dropdown menu with the following options:
  - View user profile information (name, email, role)
  - Navigate to Settings
  - **Sign Out** -- End the current session and return to the login page

---

### 11.2 Status Bar (Desktop Only)

The status bar is fixed at the bottom of the application window and is visible only on desktop browsers. It displays the following telemetry from left to right:

**Throughput**
- Current data transfer rate displayed in KB/s or MB/s.
- Represents the volume of neural data being transmitted from the hardware to the platform.

**Buffer**
- Buffer usage as a percentage:
  - **Green (0-50%)** -- Healthy buffer utilization
  - **Amber (50-80%)** -- Elevated buffer usage; system may need attention
  - **Red (>80%)** -- Critical buffer usage; data loss may occur if not addressed

**Sample Rate**
- The current sampling rate displayed in kHz, along with the number of active channels (e.g., "30 kHz -- 4096 ch").

**Agent Health Dots**
- A row of small color-coded dots, one for each of the 7 system agents:
  - **Green** -- Agent is online and operating normally
  - **Amber** -- Agent is in a degraded state
  - **Red** -- Agent has encountered an error

**Agent Count**
- A numeric summary showing the count of online agents versus total agents (e.g., "7/7 Online").

**Version**
- Displays the application version: **CNEAv5 Neural Interface v1.0.0**

---

## 12. Mobile Usage

### 12.1 Navigation

The platform is fully responsive and adapts to mobile screen sizes.

- Tap the **hamburger menu icon** (three horizontal lines) in the top-left corner of the screen to open the sidebar navigation.
- The sidebar opens as a **full-height overlay** that slides in from the left.
- Tap a **menu item** to navigate to the corresponding page. The sidebar closes automatically after selection.
- Tap **outside the sidebar** to close it without navigating.

---

### 12.2 Responsive Behavior

Each page adapts to smaller screens as follows:

**Dashboard**
- Cards and widgets stack in a single-column layout instead of the multi-column desktop grid.
- Charts resize to fit the screen width.

**Visualization**
- The Channel Selection and Settings panels are hidden by default to maximize the visualization area.
- Tap the panel toggle icons in the toolbar to expand either panel as a slide-over.
- Visualization renders at full screen width.

**Controls**
- Configuration tabs are displayed as horizontally scrollable tabs.
- Parameter sliders and inputs stack vertically in a single-column layout.
- The stimulation channel grid remains interactive and touch-friendly.

**Chat Panel**
- Opens as a **full-screen overlay** instead of a side panel.
- The text input field and send button are positioned at the bottom of the screen for easy thumb access.

**Status Bar**
- The status bar is **hidden on mobile** devices to conserve screen space. System health information remains accessible via the Dashboard and header indicators.

---

### 12.3 Tips for Mobile

- Use **landscape orientation** when viewing the Visualization page for a wider display of charts and heatmaps.
- **Pinch to zoom** on charts, heatmaps, and raster plots to examine fine detail.
- **Swipe horizontally** to scroll through parameter lists and configuration tabs on the Controls page.
- For extended configuration sessions, consider using a tablet or desktop for a more comfortable experience.

---

## 13. Troubleshooting

### 13.1 Common Issues

**"Degraded" Connection Status**
- **Symptom:** The connection status indicator shows amber or red, or one or more agents display a degraded or offline status.
- **Resolution:** Check that all Docker containers are running. Use `docker-compose ps` to verify. Restart any stopped containers with `docker-compose up -d [service-name]`.

**No Data Appearing in Visualization**
- **Symptom:** The Visualization page loads but no data is displayed.
- **Resolution:** Ensure that a recording session is currently active, or select a saved recording for playback. Verify that the FPGA is connected and reporting a "Ready" status in the header.

**AI Chat Not Responding**
- **Symptom:** Messages sent to the AI assistant receive no response or an error message.
- **Resolution:** Verify that the LLM agent is running by checking its status in the Agent Health Monitor. Ensure that the Ollama service is accessible and operational.

**Configuration Not Applying**
- **Symptom:** Clicking "Apply Configuration" does not produce a confirmation toast, or the hardware does not reflect the new settings.
- **Resolution:** Verify the hardware connection by checking the FPGA status indicator in the header. Ensure the relevant configuration agent is online and not in an error state.

**Login Failure**
- **Symptom:** Unable to log in despite entering credentials.
- **Resolution:** Double-check that your email and password are entered correctly. If the issue persists, contact your system administrator for a password reset or account verification.

**Slow Performance or High Latency**
- **Symptom:** The interface feels sluggish, or the status bar shows elevated latency values.
- **Resolution:** Check the buffer usage indicator in the status bar. If buffer usage is above 80%, the system may be overloaded. Consider reducing the number of active channels or the sampling rate. Verify network bandwidth between the client and server.

---

### 13.2 Getting Help

**AI Assistant**
Use the built-in AI Assistant (Section 8) for system-related questions, configuration guidance, and data analysis support. The assistant has access to system documentation and can provide context-aware answers.

**System Administrator**
Contact your system administrator for:
- Account creation and password resets
- User role changes
- Infrastructure and deployment issues
- Hardware maintenance and replacement

**Docker Logs**
For advanced troubleshooting, inspect the logs of individual services:
```bash
docker-compose logs -f [service-name]
```
Replace `[service-name]` with the name of the specific service you want to investigate (e.g., `fpga-agent`, `llm-agent`, `web-frontend`).

To view logs for all services simultaneously:
```bash
docker-compose logs -f
```

---

*CNEAv5 Neural Interfacing Platform -- User Guide v1.0.0*
