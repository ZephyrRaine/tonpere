// Shared sound box functions for index.html and calendar.html

function playCaca() {
  var caca = document.getElementById("caca");
  if (caca) {
    caca.play();
  }
}

function initLeop() {
  const leopAudio = document.getElementById('leop');
  const progress = document.querySelector('.progress-ring');
  const pause = document.querySelector('.pause');
  const progressCircle = document.querySelector('.progress-ring__progress');
  
  if (!leopAudio || !progress || !pause || !progressCircle) {
    return;
  }

  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  let isPlaying = false;

  function toggleLeop() {
    if (isPlaying) {
      stopLeop();
    } else {
      playLeop();
    }
  }

  function playLeop() {
    leopAudio.currentTime = 0;
    leopAudio.play();
    progress.style.visibility = "visible";
    pause.style.visibility = "visible";
    isPlaying = true;
  }

  function stopLeop() {
    leopAudio.pause();
    leopAudio.currentTime = 0;
    progress.style.visibility = "hidden";
    pause.style.visibility = "hidden";
    isPlaying = false;
    updateProgress(0);
  }

  function updateProgress(percent) {
    const offset = circumference - percent * circumference;
    progressCircle.style.strokeDashoffset = offset;
  }

  // Make toggleLeop available globally
  window.toggleLeop = toggleLeop;

  leopAudio.addEventListener('timeupdate', () => {
    const percent = leopAudio.currentTime / leopAudio.duration;
    updateProgress(percent);
  });

  leopAudio.addEventListener('ended', () => {
    stopLeop();
  });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLeop);
} else {
  initLeop();
}

