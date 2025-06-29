const API_BASE_URL = "/api";
const WS_URL = `ws://${window.location.host}/ws`;
let allJobs = JSON.parse(localStorage.getItem("allJobs") || "[]");
let websocket = null;
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;

// Initialize the app
document.addEventListener("DOMContentLoaded", function () {
  const emailForm = document.getElementById("emailForm");
  emailForm.addEventListener("submit", handleEmailSubmit);

  // Load job history on startup
  displayJobHistory();
  updateJobStats();

  // Initialize WebSocket connection
  initWebSocket();

  // Load complete job history from server
  loadCompleteJobHistory();
});

// WebSocket connection management
function initWebSocket() {
  try {
    websocket = new WebSocket(WS_URL);

    websocket.onopen = function (event) {
      console.log("WebSocket connected");
      reconnectAttempts = 0;
      updateConnectionStatus(true);
    };

    websocket.onmessage = function (event) {
      try {
        const message = JSON.parse(event.data);
        handleWebSocketMessage(message);
      } catch (error) {
        console.error("Error parsing WebSocket message:", error);
      }
    };

    websocket.onclose = function (event) {
      console.log("WebSocket disconnected");
      updateConnectionStatus(false);
      attemptReconnect();
    };

    websocket.onerror = function (error) {
      console.error("WebSocket error:", error);
      updateConnectionStatus(false);
    };
  } catch (error) {
    console.error("Error initializing WebSocket:", error);
    updateConnectionStatus(false);
  }
}

// Handle WebSocket reconnection
function attemptReconnect() {
  if (reconnectAttempts < maxReconnectAttempts) {
    reconnectAttempts++;
    const delay = Math.pow(2, reconnectAttempts) * 1000; // Exponential backoff
    console.log(
      `Attempting WebSocket reconnection ${reconnectAttempts}/${maxReconnectAttempts} in ${delay}ms`
    );

    setTimeout(() => {
      initWebSocket();
    }, delay);
  } else {
    console.log("Max reconnection attempts reached");
    updateConnectionStatus(false, "Connection failed - please refresh page");
  }
}

// Handle incoming WebSocket messages
function handleWebSocketMessage(message) {
  console.log("Received WebSocket message:", message);

  switch (message.type) {
    case "connection_status":
      if (message.data.connected) {
        updateConnectionStatus(true);
      }
      break;

    case "job_created":
      handleJobCreated(message.data);
      break;

    case "job_status_update":
      handleJobStatusUpdate(message.data);
      break;

    case "pong":
      console.log("Received pong from server");
      break;

    default:
      console.log("Unknown message type:", message.type);
  }
}

// Update connection status indicator
function updateConnectionStatus(connected, message = "") {
  const statusElement = document.getElementById("connectionStatus");
  if (!statusElement) {
    // Create status indicator if it doesn't exist
    const statusDiv = document.createElement("div");
    statusDiv.id = "connectionStatus";
    statusDiv.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            padding: 5px 10px;
            border-radius: 5px;
            font-size: 12px;
            z-index: 1000;
        `;
    document.body.appendChild(statusDiv);
  }

  const indicator = document.getElementById("connectionStatus");
  if (connected) {
    indicator.textContent = "🟢 Live Updates Connected";
    indicator.style.backgroundColor = "#d4edda";
    indicator.style.color = "#155724";
    indicator.style.border = "1px solid #c3e6cb";
  } else {
    indicator.textContent = message || "🔴 Live Updates Disconnected";
    indicator.style.backgroundColor = "#f8d7da";
    indicator.style.color = "#721c24";
    indicator.style.border = "1px solid #f5c6cb";
  }
}

// Handle new job created
function handleJobCreated(jobData) {
  console.log("New job created:", jobData);

  // Add to all jobs if not already there
  const existingJobIndex = allJobs.findIndex(
    (job) => job.job_id === jobData.job_id
  );
  if (existingJobIndex === -1) {
    allJobs.unshift(jobData);
    localStorage.setItem("allJobs", JSON.stringify(allJobs));
    displayJobHistory();
    updateJobStats();
  }
}

// Handle job status updates
function handleJobStatusUpdate(jobData) {
  console.log("Job status updated:", jobData);

  // Update the job in all jobs
  const jobIndex = allJobs.findIndex((job) => job.job_id === jobData.job_id);
  if (jobIndex !== -1) {
    allJobs[jobIndex] = { ...allJobs[jobIndex], ...jobData };
    localStorage.setItem("allJobs", JSON.stringify(allJobs));
    displayJobHistory();
    updateJobStats();
  } else {
    // Job not found locally, add it
    allJobs.unshift(jobData);
    localStorage.setItem("allJobs", JSON.stringify(allJobs));
    displayJobHistory();
    updateJobStats();
  }

  // Show toast notification for status changes
  showStatusNotification(jobData);
}

// Show status change notifications
function showStatusNotification(jobData) {
  const notification = document.createElement("div");
  notification.style.cssText = `
        position: fixed;
        top: 60px;
        right: 10px;
        background: #007bff;
        color: white;
        padding: 10px 15px;
        border-radius: 5px;
        z-index: 1001;
        max-width: 300px;
        font-size: 14px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    `;

  const statusIcon =
    jobData.status === "completed"
      ? "✅"
      : jobData.status === "processing"
      ? "⚙️"
      : jobData.status === "failed"
      ? "❌"
      : "📧";

  notification.innerHTML = `
        ${statusIcon} <strong>Job ${jobData.status}</strong><br>
        <small>${jobData.job_id.substring(0, 8)}... → ${jobData.to}</small>
    `;

  document.body.appendChild(notification);

  // Auto-remove after 3 seconds
  setTimeout(() => {
    if (notification.parentNode) {
      notification.parentNode.removeChild(notification);
    }
  }, 3000);
}

// Handle email form submission
async function handleEmailSubmit(event) {
  event.preventDefault();

  const form = event.target;
  const formData = new FormData(form);

  const emailData = {
    to: formData.get("to"),
    subject: formData.get("subject"),
    body: formData.get("body"),
  };

  const resultDiv = document.getElementById("result");
  resultDiv.className = "result";
  resultDiv.innerHTML = '<div class="loading">Sending email...</div>';
  resultDiv.classList.remove("hidden");

  try {
    const response = await fetch(`${API_BASE_URL}/emails`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(emailData),
    });

    const result = await response.json();

    if (response.ok) {
      // Success
      resultDiv.className = "result success";
      resultDiv.innerHTML = `
                <strong>✅ Email queued successfully!</strong><br>
                Job ID: <code>${result.job_id}</code><br>
                Status: ${result.status}<br>
                <small>Watch the job history below for real-time updates!</small>
            `;

      // Clear form
      form.reset();
    } else {
      // Error from API
      resultDiv.className = "result error";
      resultDiv.innerHTML = `<strong>❌ Error:</strong> ${
        result.error || "Failed to send email"
      }`;
    }
  } catch (error) {
    // Network or other error
    resultDiv.className = "result error";
    resultDiv.innerHTML = `<strong>❌ Network Error:</strong> ${error.message}`;
  }
}

// Load complete job history from server
async function loadCompleteJobHistory() {
  try {
    const response = await fetch(`${API_BASE_URL}/jobs/history`);
    const data = await response.json();

    if (response.ok && data.jobs) {
      // Merge server data with local data
      const serverJobs = data.jobs;
      const allJobIds = new Set(allJobs.map((job) => job.job_id));

      // Add server jobs that aren't already local
      serverJobs.forEach((serverJob) => {
        if (!allJobIds.has(serverJob.job_id)) {
          allJobs.push(serverJob);
        }
      });

      // Sort by created_at descending
      allJobs.sort(
        (a, b) =>
          new Date(b.created_at || b.timestamp) -
          new Date(a.created_at || a.timestamp)
      );

      localStorage.setItem("allJobs", JSON.stringify(allJobs));
      displayJobHistory();
      updateJobStats();
    }
  } catch (error) {
    console.error("Error loading complete job history:", error);
  }
}

// Display enhanced job history
function displayJobHistory() {
  const container = document.getElementById("jobHistory");

  if (allJobs.length === 0) {
    container.innerHTML =
      '<p class="no-jobs">No jobs yet. Submit an email to see live updates!</p>';
    return;
  }

  const jobsHTML = allJobs.map((job) => createJobCard(job)).join("");
  container.innerHTML = jobsHTML;
}

// Create detailed job card HTML
function createJobCard(job) {
  const statusIcon = getStatusIcon(job.status);
  const timeAgo = getTimeAgo(job.created_at || job.timestamp);

  // Process history array
  let historyHTML = "";
  if (job.history && Array.isArray(job.history) && job.history.length > 0) {
    const sortedHistory = job.history.sort(
      (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
    );
    historyHTML = `
            <div class="status-history">
                <h4>📊 Status Timeline</h4>
                <div class="history-timeline">
                    ${sortedHistory
                      .map(
                        (entry) => `
                        <div class="history-item ${entry.status}">
                            <span class="history-status">${entry.status}</span>
                            <span class="history-timestamp">${formatTimestamp(
                              entry.timestamp
                            )}</span>
                            ${
                              entry.error
                                ? `<div class="error-message">Error: ${entry.error}</div>`
                                : ""
                            }
                        </div>
                    `
                      )
                      .join("")}
                </div>
            </div>
        `;
  }

  return `
        <div class="job-card status-${job.status}">
            <div class="job-header">
                <div class="job-info">
                    <h3>${statusIcon} ${job.subject || "No Subject"}</h3>
                    <div class="job-id">${job.job_id}</div>
                </div>
                <div class="job-status-badge ${job.status}">${job.status}</div>
            </div>
            
            <div class="job-details">
                <div class="job-detail-row">
                    <strong>To:</strong>
                    <span>${job.to}</span>
                </div>
                <div class="job-detail-row">
                    <strong>Created:</strong>
                    <span>${timeAgo} (${formatTimestamp(
    job.created_at || job.timestamp
  )})</span>
                </div>
                <div class="job-detail-row">
                    <strong>Updated:</strong>
                    <span>${
                      job.updated_at ? formatTimestamp(job.updated_at) : "-"
                    }</span>
                </div>
                ${
                  job.retry_count
                    ? `
                    <div class="job-detail-row">
                        <strong>Retries:</strong>
                        <span>${job.retry_count}/${job.max_retries || 3}</span>
                    </div>
                `
                    : ""
                }
                ${
                  job.last_error
                    ? `
                    <div class="job-detail-row">
                        <strong>Error:</strong>
                        <span style="color: #e53e3e;">${job.last_error}</span>
                    </div>
                `
                    : ""
                }
            </div>
            
            ${historyHTML}
        </div>
    `;
}

// Update job statistics
function updateJobStats() {
  const stats = {
    total: allJobs.length,
    completed: allJobs.filter((job) => job.status === "completed").length,
    processing: allJobs.filter((job) => job.status === "processing").length,
    failed: allJobs.filter((job) => job.status === "failed").length,
  };

  document.getElementById("totalJobs").textContent = stats.total;
  document.getElementById("completedJobs").textContent = stats.completed;
  document.getElementById("processingJobs").textContent = stats.processing;
  document.getElementById("failedJobs").textContent = stats.failed;
}

// Utility functions
function getStatusIcon(status) {
  const icons = {
    queued: "📧",
    processing: "⚙️",
    completed: "✅",
    failed: "❌",
    retrying: "🔄",
  };
  return icons[status] || "📄";
}

function getTimeAgo(timestamp) {
  const now = new Date();
  const time = new Date(timestamp);
  const diffInSeconds = Math.floor((now - time) / 1000);

  if (diffInSeconds < 60) return `${diffInSeconds}s ago`;
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  return `${Math.floor(diffInSeconds / 86400)}d ago`;
}

function formatTimestamp(timestamp) {
  return new Date(timestamp).toLocaleString();
}

// Control functions for the enhanced history
function refreshJobHistory() {
  loadCompleteJobHistory();
}

function clearJobHistory() {
  if (
    confirm(
      "Are you sure you want to clear the local job history? This will only clear locally stored data."
    )
  ) {
    allJobs = [];
    localStorage.removeItem("allJobs");
    displayJobHistory();
    updateJobStats();
  }
}
