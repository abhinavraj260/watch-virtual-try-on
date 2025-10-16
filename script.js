// DOM Elements
const videoElement = document.getElementById('videoElement');
const overlayCanvas = document.getElementById('overlayCanvas');
const watchCanvas = document.getElementById('watchCanvas');
const overlayContext = overlayCanvas?.getContext('2d');
const watchContext = watchCanvas?.getContext('2d');
const imageUpload = document.getElementById('imageUpload');
const uploadButton = document.getElementById('uploadButton');
const watchImage = document.getElementById('watchImage');
const feedback = document.getElementById('feedback');
const errorDisplay = document.getElementById('error');
const detectionStatus = document.getElementById('detectionStatus');
const statusIndicator =document.getElementById('statusIndicator');
const handInfo = document.getElementById('handInfo');
const palmIndicator = document.getElementById('palmIndicator');
const leftHandBtn = document.getElementById('leftHandBtn');
const rightHandBtn = document.getElementById('rightHandBtn');
const toggleDetectionBtn = document.getElementById('toggleDetection');
const exportImageBtn = document.getElementById('exportImage');
const processingCanvas = document.createElement('canvas');
const processingContext = processingCanvas?.getContext('2d', { willReadFrequently: true });

// Check if all elements are properly loaded
if (!videoElement || !overlayCanvas || !watchCanvas || !overlayContext || !watchContext) {
    console.error('Required elements not found. Please check your HTML structure.');
    throw new Error('Required elements not found');
}

// Global variables
let watchWidth = 0, watchHeight = 0, imageLoaded = false, cameraInitialized = false;
let isDetecting = false, model = null, watchRotation = 0, lastWristPosition = null;
let wristWidth = 0, processedWatchImage = null, lastFrameTime = 0, watchScale = 1.0;
let lastFewPositions = [], handOrientation = 'unknown', confidenceScore = 0;
let isDragging = false, dragStartX = 0, dragStartY = 0, lastWatchScale = 1.0, initialDistance = 0;
let selectedHand = null; // 'left' or 'right'
let detectedHandType = 'unknown'; // 'left' or 'right'
let palmDirection = 'unknown'; // 'up' or 'down'
let isModelLoading = false; // Track model loading state
const POSITION_HISTORY_LENGTH = 5;

// Display functions
const showError = message => {
    errorDisplay.textContent = message;
    errorDisplay.style.display = 'block';
};

const clearError = () => {
    errorDisplay.textContent = '';
    errorDisplay.style.display = 'none';
};

const updateStatus = (message, type = 'info') => {
    detectionStatus.textContent = message;
    statusIndicator.className = `status-indicator ${type === 'error' ? 'inactive' : type === 'warning' ? 'warning' : 'active'}`;
    detectionStatus.className = `font-medium ${type === 'error' ? 'text-red-600' : type === 'warning' ? 'text-yellow-600' : 'text-blue-600'}`;
};

const updateHandInfo = (handType, palmDir, confidence) => {
    if (handType !== 'unknown') {
        handInfo.textContent = `Detected: ${handType} hand, palm ${palmDir} (${(confidence * 100).toFixed(0)}%)`;
        
        // Update palm indicator
        palmIndicator.textContent = `${handType.toUpperCase()} HAND - PALM ${palmDir.toUpperCase()}`;
        palmIndicator.className = `palm-indicator palm-${palmDir}`;
        palmIndicator.classList.remove('hidden');
    } else {
        handInfo.textContent = '';
        palmIndicator.classList.add('hidden');
    }
};

// Validate if detected hand matches selected hand
function validateHandMatch(detectedHand, selectedHand) {
    return detectedHand === selectedHand;
}

// Hand selection event listeners
leftHandBtn.addEventListener('click', () => {
    selectedHand = 'left';
    leftHandBtn.classList.add('active');
    rightHandBtn.classList.remove('active');
    updateStatus('Left hand selected. Upload watch image to continue.');
    checkReadyState();
});

rightHandBtn.addEventListener('click', () => {
    selectedHand = 'right';
    rightHandBtn.classList.add('active');
    leftHandBtn.classList.remove('active');
    updateStatus('Right hand selected. Upload watch image to continue.');
    checkReadyState();
});

// Check if ready to start detection
function checkReadyState() {
    const ready = selectedHand && imageLoaded && cameraInitialized && model;
    toggleDetectionBtn.disabled = !ready;
    
    if (ready && !isDetecting) {
        toggleDetectionBtn.innerHTML = '<i class="material-icons mr-2">play_arrow</i> Start Detection';
        updateStatus(`Ready to detect ${selectedHand} hand!`);
    } else if (!selectedHand) {
        updateStatus('Please select which hand to use', 'warning');
    } else if (!imageLoaded) {
        updateStatus('Upload a watch image to continue', 'warning');
    } else if (!cameraInitialized) {
        updateStatus('Camera not initialized', 'warning');
    } else if (!model) {
        updateStatus('Loading hand detection model...', 'warning');
    }
}

// Auto-start camera when both hand and image are selected
function tryAutoStartCamera() {
    if (selectedHand && imageLoaded && !cameraInitialized) {
        startCamera();
    }
}

// Load hand detection model
async function loadHandDetectionModel() {
    if (isModelLoading) return; // Prevent multiple loading attempts
    isModelLoading = true;
    
    updateStatus("Loading hand detection model...", 'warning');
    try {
        // Check if tfjs and handpose are available
        if (!window.tf) {
            throw new Error("TensorFlow.js is not loaded");
        }
        if (!window.handpose) {
            throw new Error("Handpose model is not loaded");
        }

        // Configure model with optimal settings
        const modelConfig = {
            maxHands: 1,
            detectionConfidence: 0.8,
            iouThreshold: 0.3,
            scoreThreshold: 0.75
        };

        model = await handpose.load(modelConfig);
        
        if (!model) {
            throw new Error("Failed to initialize hand detection model");
        }

        console.log("Hand detection model loaded successfully");
        updateStatus("Hand detection model loaded! Ready to start detection.");
        checkReadyState();
    } catch (error) {
        console.error("Model loading failed:", error);
        showError(`Failed to load hand detection model: ${error.message}. Please refresh and try again.`);
        updateStatus("Model loading failed", 'error');
    } finally {
        isModelLoading = false;
    }
}

// Start camera with improved error handling
async function startCamera() {
    clearError();
    if (!navigator.mediaDevices?.getUserMedia) {
        showError("Camera access not supported in this browser. Please try a modern browser like Chrome or Firefox.");
        return;
    }
    
    try {
        updateStatus('Requesting camera access...', 'warning');
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: 'user',
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 30 }
            }
        });
        
        videoElement.srcObject = stream;
        videoElement.onloadedmetadata = () => {
            videoElement.play();
            videoElement.classList.remove('hidden');
            
            // Set canvas dimensions
            [overlayCanvas.width, overlayCanvas.height] = 
                [watchCanvas.width, watchCanvas.height] = 
                [videoElement.videoWidth, videoElement.videoHeight];
            
            cameraInitialized = true;
            updateStatus("Camera initialized. Loading hand detection model...", 'warning');
            
            // Load model after camera is ready
            loadHandDetectionModel();
        };
    } catch (err) {
        console.error("Camera access error:", err);
        let errorMessage = "Cannot access camera. ";
        
        switch(err.name) {
            case 'NotAllowedError':
                errorMessage += "Please allow camera access and refresh.";
                break;
            case 'NotFoundError':
                errorMessage += "No camera found. Please connect a camera.";
                break;
            case 'NotReadableError':
                errorMessage += "Camera is in use by another application.";
                break;
            default:
                errorMessage += "Please check permissions and try again.";
        }
        
        showError(errorMessage);
        updateStatus("Camera access denied", 'error');
    }
}

// Determine if hand is left or right based on landmarks
function determineHandType(landmarks) {
    const wrist = landmarks[0];
    const indexMCP = landmarks[5];
    const pinkyMCP = landmarks[17];
    
    // For front camera: if pinky is to the left of index finger, it's a right hand
    const isRightHand = pinkyMCP[0] < indexMCP[0];
    return isRightHand ? 'right' : 'left';
}

// Determine palm direction (up or down)
function determinePalmDirection(landmarks) {
    // Key landmarks for palm detection
    const wrist = landmarks[0];
    const thumbCMC = landmarks[1]; // Thumb base
    const indexMCP = landmarks[5]; // Index finger base
    const middleMCP = landmarks[9]; // Middle finger base
    const ringMCP = landmarks[13]; // Ring finger base
    const pinkyMCP = landmarks[17]; // Pinky base
    
    // Calculate the average Z-coordinate of finger bases
    const fingerBasesZ = (indexMCP[2] + middleMCP[2] + ringMCP[2] + pinkyMCP[2]) / 4;
    const wristZ = wrist[2];
    const thumbZ = thumbCMC[2];
    
    // Calculate vectors
    const wristToFingers = {
        x: (indexMCP[0] + middleMCP[0] + ringMCP[0] + pinkyMCP[0]) / 4 - wrist[0],
        y: (indexMCP[1] + middleMCP[1] + ringMCP[1] + pinkyMCP[1]) / 4 - wrist[1],
        z: fingerBasesZ - wristZ
    };
    
    const wristToThumb = {
        x: thumbCMC[0] - wrist[0],
        y: thumbCMC[1] - wrist[1],
        z: thumbZ - wristZ
    };
    
    // Cross product to get palm normal
    const palmNormal = {
        x: wristToFingers.y * wristToThumb.z - wristToFingers.z * wristToThumb.y,
        y: wristToFingers.z * wristToThumb.x - wristToFingers.x * wristToThumb.z,
        z: wristToFingers.x * wristToThumb.y - wristToFingers.y * wristToThumb.x
    };
    
    // Additional check: compare Z values
    const zDifference = fingerBasesZ - wristZ;
    
    // If fingers are closer to camera than wrist, likely palm down
    // If wrist is closer to camera than fingers, likely palm up
    const palmDirection = zDifference < -0.02 ? 'down' : 'up';
    
    // Use palm normal Z component as additional validation
    const normalBasedDirection = palmNormal.z > 0 ? 'up' : 'down';
    
    // Combine both methods for more accuracy
    return palmDirection === normalBasedDirection ? palmDirection : 
           (Math.abs(zDifference) > 0.03 ? palmDirection : normalBasedDirection);
}

// Image upload handling
uploadButton.addEventListener('click', () => imageUpload.click());

imageUpload.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            watchWidth = img.width;
            watchHeight = img.height;
            processWatchImage(img);
        };
        img.src = e.target.result;
        watchImage.src = e.target.result;
        feedback.textContent = "Processing watch image...";
    };
    reader.onerror = () => {
        showError("Error loading image. Try another.");
        imageLoaded = false;
    };
    reader.readAsDataURL(file);
});

// Toggle Detection
toggleDetectionBtn.addEventListener('click', () => {
    if (isDetecting) {
        stopDetection();
        toggleDetectionBtn.innerHTML = '<i class="material-icons mr-2">play_arrow</i> Start Detection';
    } else {
        startDetection();
        toggleDetectionBtn.innerHTML = '<i class="material-icons mr-2">pause</i> Stop Detection';
    }
});

// Export Image
exportImageBtn.addEventListener('click', exportCurrentView);

// Improved image processing for metallic watches
function processWatchImage(originalImg) {
    // Setup canvas
    processingCanvas.width = originalImg.width;
    processingCanvas.height = originalImg.height;
    processingContext.drawImage(originalImg, 0, 0);
    
    const imageData = processingContext.getImageData(0, 0, processingCanvas.width, processingCanvas.height);
    const data = imageData.data;
    const width = processingCanvas.width;
    const height = processingCanvas.height;
    const mask = new Array(width * height).fill(0);
    
    // Sample multiple regions for better background detection
    const samples = [];
    
    // Sample entire border (not just corners)
    const borderWidth = Math.max(10, Math.floor(Math.min(width, height) * 0.03));
    
    // Top and bottom borders
    for (let x = 0; x < width; x++) {
        for (let y = 0; y < borderWidth; y++) {
            addSample(samples, x, y, width, data);
            addSample(samples, x, height - y - 1, width, data);
        }
    }
    
    // Left and right borders
    for (let y = borderWidth; y < height - borderWidth; y++) {
        for (let x = 0; x < borderWidth; x++) {
            addSample(samples, x, y, width, data);
            addSample(samples, width - x - 1, y, width, data);
        }
    }
    
    // Calculate background color statistics
    const avgBackground = calculateAverageColor(samples);
    const colorVariance = calculateColorVariance(samples, avgBackground);
    
    // Adaptive threshold based on variance
    const baseThreshold = 32; // Higher base threshold for metallic watches
    const adaptiveThreshold = baseThreshold + Math.sqrt(colorVariance) * 0.7;
    
    // Process image with improved edge detection and color similarity
    improvedWatchMask(data, width, height, mask, avgBackground, adaptiveThreshold);
    
    // Apply mask to image
    for (let i = 0; i < data.length; i += 4) {
        const pixelIndex = Math.floor(i / 4);
        if (mask[pixelIndex] === 0) {
            data[i + 3] = 0; // Set transparent
        }
    }
    
    processingContext.putImageData(imageData, 0, 0);
    
    // Create processed image
    processedWatchImage = new Image();
    processedWatchImage.onload = () => {
        watchImage.src = processedWatchImage.src;
        watchImage.classList.remove('hidden');
        
        imageLoaded = true;
        feedback.textContent = "Watch image processed successfully!";
        
        // Try to auto-start camera if hand is selected
        tryAutoStartCamera();
        checkReadyState();
    };
    processedWatchImage.src = processingCanvas.toDataURL('image/png');
}

// Helper functions for improved image processing
function addSample(samples, x, y, width, data) {
    const idx = (y * width + x) * 4;
    samples.push({
        r: data[idx],
        g: data[idx + 1],
        b: data[idx + 2]
    });
}

function calculateAverageColor(samples) {
    if (samples.length === 0) return { r: 0, g: 0, b: 0 };
    
    let r = 0, g = 0, b = 0;
    samples.forEach(s => { r += s.r; g += s.g; b += s.b; });
    return { 
        r: r / samples.length, 
        g: g / samples.length, 
        b: b / samples.length 
    };
}

function calculateColorVariance(samples, avg) {
    if (samples.length <= 1) return 0;
    
    let sumSquaredDiff = 0;
    samples.forEach(s => {
        const dr = s.r - avg.r;
        const dg = s.g - avg.g;
        const db = s.b - avg.b;
        sumSquaredDiff += dr*dr + dg*dg + db*db;
    });
    
    return sumSquaredDiff / samples.length;
}

function improvedWatchMask(data, width, height, mask, avgBg, threshold) {
    // Edge detection kernel (Sobel)
    const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
    const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
    
    // Calculate edge intensity and color distance
    const edgeMap = new Array(width * height).fill(0);
    const colorDistMap = new Array(width * height).fill(0);
    
    // Calculate color distances and edge detection
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const pixelIndex = y * width + x;
            const idx = pixelIndex * 4;
            
            // Color distance to background (weighted for metallic hues)
            const rDiff = (data[idx] - avgBg.r);
            const gDiff = (data[idx + 1] - avgBg.g);
            const bDiff = (data[idx + 2] - avgBg.b);
            
            // Special handling for gold and rose gold colors
            // These have higher red and green channels typically
            const isGoldLike = data[idx] > 180 && data[idx + 1] > 140 && data[idx] > data[idx + 2] + 30;
            
            // Adjust weights for better metallic detection
            const rWeight = isGoldLike ? 0.2 : 0.3;
            const gWeight = isGoldLike ? 0.2 : 0.59;
            const bWeight = isGoldLike ? 0.6 : 0.11; // Higher blue weight helps differentiate gold
            
            const colorDist = Math.sqrt(
                (rDiff * rDiff * rWeight) + 
                (gDiff * gDiff * gWeight) + 
                (bDiff * bDiff * bWeight)
            );
            
            colorDistMap[pixelIndex] = colorDist;
            
            // Edge detection
            let gradX = 0, gradY = 0;
            for (let ky = -1; ky <= 1; ky++) {
                for (let kx = -1; kx <= 1; kx++) {
                    const neighborIdx = ((y + ky) * width + (x + kx)) * 4;
                    const kernelIdx = (ky + 1) * 3 + (kx + 1);
                    
                    // Calculate intensity
                    const intensity = (data[neighborIdx] + data[neighborIdx + 1] + data[neighborIdx + 2]) / 3;
                    
                    gradX += intensity * sobelX[kernelIdx];
                    gradY += intensity * sobelY[kernelIdx];
                }
            }
            
            // Calculate edge magnitude
            edgeMap[pixelIndex] = Math.sqrt(gradX * gradX + gradY * gradY);
        }
    }
    
    // Combine edge detection and color distance for better segmentation
    for (let i = 0; i < width * height; i++) {
        // Normalize edge intensity (0-255)
        const normalizedEdge = Math.min(255, edgeMap[i]) / 255;
        
        // Combined metric: favor high color distance or strong edges
        const combinedMetric = colorDistMap[i] + (normalizedEdge * 80);
        
        // Mark as foreground if either metric is significant
        mask[i] = combinedMetric > threshold ? 1 : 0;
    }
    
    // Morphological operations to clean up the mask
    const tempMask = [...mask];
    
    // Dilate (expand) mask to fill holes
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const idx = y * width + x;
            if (mask[idx] === 0) {
                // Check neighbors
                let hasNeighbor = false;
                for (let ky = -1; ky <= 1; ky++) {
                    for (let kx = -1; kx <= 1; kx++) {
                        const neighborIdx = (y + ky) * width + (x + kx);
                        if (mask[neighborIdx] === 1) {
                            hasNeighbor = true;
                            break;
                        }
                    }
                    if (hasNeighbor) break;
                }
                
                if (hasNeighbor) {
                    // Additional check for gold-like colors
                    const dataIdx = idx * 4;
                    const r = data[dataIdx];
                    const g = data[dataIdx + 1];
                    const b = data[dataIdx + 2];
                    
                    // Is this pixel gold-like?
                    const isGoldLike = r > 180 && g > 140 && r > b + 30;
                    
                    if (isGoldLike || (Math.abs(r - avgBg.r) > threshold/2 || 
                                      Math.abs(g - avgBg.g) > threshold/2 || 
                                      Math.abs(b - avgBg.b) > threshold/2)) {
                        tempMask[idx] = 1;
                    }
                }
            }
        }
    }
    
    // Copy result back to mask
    for (let i = 0; i < mask.length; i++) {
        mask[i] = tempMask[i];
    }
    
    // Fill large internal holes (watches often have circular/empty centers)
    floodFillHoles(mask, width, height);
}

// Fill internal holes in the mask
function floodFillHoles(mask, width, height) {
    // Create a buffer to track visited pixels
    const visited = new Array(width * height).fill(false);
    const isBackground = new Array(width * height).fill(false);
    
    // Queue for flood fill
    const queue = [];
    
    // Mark boundary pixels as background and add to queue
    for (let x = 0; x < width; x++) {
        queue.push(x);
        queue.push((height - 1) * width + x);
        visited[x] = visited[(height - 1) * width + x] = true;
        isBackground[x] = isBackground[(height - 1) * width + x] = true;
    }
    
    for (let y = 1; y < height - 1; y++) {
        queue.push(y * width);
        queue.push(y * width + width - 1);
        visited[y * width] = visited[y * width + width - 1] = true;
        isBackground[y * width] = isBackground[y * width + width - 1] = true;
    }
    
    // Conduct flood fill from the border
    const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    
    while (queue.length > 0) {
        const pixel = queue.shift();
        const x = pixel % width;
        const y = Math.floor(pixel / width);
        
        for (const [dx, dy] of directions) {
            const nx = x + dx;
            const ny = y + dy;
            
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                const neighborIdx = ny * width + nx;
                
                if (!visited[neighborIdx] && mask[neighborIdx] === 0) {
                    visited[neighborIdx] = true;
                    isBackground[neighborIdx] = true;
                    queue.push(neighborIdx);
                }
            }
        }
    }
    
    // All unvisited pixels with mask=0 are internal holes, set them to 1
    for (let i = 0; i < mask.length; i++) {
        if (mask[i] === 0 && !isBackground[i]) {
            mask[i] = 1;
        }
    }
}

// Hand and wrist detection
async function detectWrist() {
    if (!videoElement?.readyState === videoElement?.HAVE_ENOUGH_DATA || !model) return null;

    try {
        const predictions = await model.estimateHands(videoElement, {
            flipHorizontal: true
        });
        
        if (!predictions.length) {
            updateStatus(`Show your ${selectedHand} hand to the camera`, 'warning');
            updateHandInfo('unknown', 'unknown', 0);
            return null;
        }
        
        const landmarks = predictions[0].landmarks;
        confidenceScore = predictions[0].handInViewConfidence;
        
        // Updated hand type detection
        detectedHandType = determineHandType(landmarks);
        palmDirection = determinePalmDirection(landmarks);
        
        if (detectedHandType !== selectedHand) {
            updateStatus(`Please show your ${selectedHand} hand`, 'warning');
            updateHandInfo(detectedHandType, palmDirection, confidenceScore);
            return null;
        }
        
        // Calculate wrist measurements
        const wrist = landmarks[0];
        const indexMCP = landmarks[5];
        const pinkyMCP = landmarks[17];
        const middleMCP = landmarks[9];
        
        const wristWidthPx = Math.hypot(
            indexMCP[0] - pinkyMCP[0],
            indexMCP[1] - pinkyMCP[1]
        ) * 1.2; // Adjusted for better proportion
        
        const wristToMiddle = {
            x: middleMCP[0] - wrist[0],
            y: middleMCP[1] - wrist[1]
        };
        
        const angle = Math.atan2(wristToMiddle.y, wristToMiddle.x);
        const offsetMultiplier = palmDirection === 'up' ? 0.15 : 0.1;
        const offsetAngle = angle + (palmDirection === 'up' ? Math.PI/2 : -Math.PI/2);
        
        const offsetX = Math.cos(offsetAngle) * (wristWidthPx * offsetMultiplier);
        const offsetY = Math.sin(offsetAngle) * (wristWidthPx * offsetMultiplier);
        
        const wristX = wrist[0] + offsetX;
        const wristY = wrist[1] + offsetY;
        
        // Watch region dimensions
        const watchSizeRatio = { width: 0.9, height: 0.7 };
        const regionWidth = wristWidthPx * watchSizeRatio.width;
        const regionHeight = wristWidthPx * watchSizeRatio.height;
        
        // Update visuals
        drawLandmarks(landmarks);
        drawWristRegion(wristX, wristY, regionWidth, regionHeight, angle, palmDirection);
        
        // Update position data
        wristWidth = regionWidth;
        watchRotation = angle - Math.PI/2;
        
        const currentWristPosition = {
            x: wristX,
            y: wristY,
            width: regionWidth,
            height: regionHeight,
            rotation: watchRotation,
            confidence: confidenceScore,
            orientation: palmDirection
        };
        
        // Position smoothing
        lastFewPositions.push(currentWristPosition);
        if (lastFewPositions.length > POSITION_HISTORY_LENGTH) lastFewPositions.shift();
        
        lastWristPosition = getSmoothedPosition(currentWristPosition);
        
        updateStatus(`${selectedHand} hand detected (${palmDirection}, ${(confidenceScore * 100).toFixed(0)}%)`);
        return lastWristPosition;
    } catch (error) {
        console.error("Hand detection error:", error);
        updateStatus("Error detecting hand", 'error');
        return null;
    }
}

// Calculate smoothed position from history
function getSmoothedPosition(currentPosition) {
    if (lastFewPositions.length < 2) return currentPosition;
    
    let totalWeight = 0;
    const smoothed = {
        x: 0, y: 0, width: 0, height: 0, rotation: 0,
        confidence: currentPosition.confidence,
        orientation: currentPosition.orientation
    };
    
    for (let i = 0; i < lastFewPositions.length; i++) {
        const pos = lastFewPositions[i];
        const recencyWeight = (i + 1) / lastFewPositions.length;
        const confidenceWeight = pos.confidence;
        const weight = recencyWeight * confidenceWeight;
        
        smoothed.x += pos.x * weight;
        smoothed.y += pos.y * weight;
        smoothed.width += pos.width * weight;
        smoothed.height += pos.height * weight;
        
        const angleDiff = normalizeAngle(pos.rotation - smoothed.rotation);
        smoothed.rotation += angleDiff * weight;
        
        totalWeight += weight;
    }
    
    if (totalWeight > 0) {
        smoothed.x /= totalWeight;
        smoothed.y /= totalWeight;
        smoothed.width /= totalWeight;
        smoothed.height /= totalWeight;
        smoothed.rotation = normalizeAngle(smoothed.rotation / totalWeight);
    }
    
    return smoothed;
}
// Helper functions for angle normalization
function normalizeAngle(angle) {
    while (angle > Math.PI) angle -= 2 * Math.PI;
    while (angle < -Math.PI) angle += 2 * Math.PI;
    return angle;
}

// Visualization functions
function drawLandmarks(landmarks) {
    overlayContext.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    
    // Draw all landmarks
    landmarks.forEach((landmark, index) => {
        const [x, y] = landmark;
        
        overlayContext.beginPath();
        overlayContext.arc(x, y, 3, 0, 2 * Math.PI);
        overlayContext.fillStyle = '#ff6b6b';
        overlayContext.fill();
        
        // Label key landmarks
        if ([0, 4, 5, 9, 13, 17].includes(index)) {
            overlayContext.fillStyle = '#fff';
            overlayContext.font = '10px Arial';
            overlayContext.fillText(index.toString(), x + 5, y - 5);
        }
    });
    
    // Draw hand connections
    const connections = [
        [0, 1], [1, 2], [2, 3], [3, 4], // Thumb
        [0, 5], [5, 6], [6, 7], [7, 8], // Index
        [0, 9], [9, 10], [10, 11], [11, 12], // Middle
        [0, 13], [13, 14], [14, 15], [15, 16], // Ring
        [0, 17], [17, 18], [18, 19], [19, 20] // Pinky
    ];
    
    overlayContext.strokeStyle = '#4ecdc4';
    overlayContext.lineWidth = 2;
    connections.forEach(([start, end]) => {
        const [x1, y1] = landmarks[start];
        const [x2, y2] = landmarks[end];
        
        overlayContext.beginPath();
        overlayContext.moveTo(x1, y1);
        overlayContext.lineTo(x2, y2);
        overlayContext.stroke();
    });
}

function drawWristRegion(x, y, width, height, rotation, orientation) {
    overlayContext.save();
    overlayContext.translate(x, y);
    overlayContext.rotate(rotation);
    
    // Draw watch region
    overlayContext.strokeStyle = orientation === 'palm-up' ? '#22c55e' : '#f59e0b';
    overlayContext.lineWidth = 3;
    overlayContext.strokeRect(-width/2, -height/2, width, height);
    
    // Draw center cross
    overlayContext.beginPath();
    overlayContext.moveTo(-10, 0);
    overlayContext.lineTo(10, 0);
    overlayContext.moveTo(0, -10);
    overlayContext.lineTo(0, 10);
    overlayContext.stroke();
    
    overlayContext.restore();
}

// Watch rendering function
function drawWatch() {
    if (!lastWristPosition || !processedWatchImage) return;
    
    const { x, y, width, height, rotation, orientation } = lastWristPosition;
    
    // Adjusted watch size for better fit
    const watchSizeMultiplier = 0.95; // Balanced size
    const baseWatchWidth = width * watchSizeMultiplier;
    const aspectRatio = watchHeight / watchWidth;
    const baseWatchHeight = baseWatchWidth * aspectRatio;
    
    watchContext.clearRect(0, 0, watchCanvas.width, watchCanvas.height);
    watchContext.save();
    watchContext.translate(x, y);
    watchContext.rotate(rotation);
    
    // Corrected flip logic for hand orientation
    const shouldFlip = (selectedHand === 'left' && orientation === 'palm-down') ||
                      (selectedHand === 'right' && orientation === 'palm-up');
    if (shouldFlip) watchContext.rotate(Math.PI);
    
    const finalWidth = baseWatchWidth * watchScale;
    const finalHeight = baseWatchHeight * watchScale;
    
    // Enhanced visual effects
    watchContext.shadowColor = 'rgba(0, 0, 0, 0.3)';
    watchContext.shadowBlur = 10;
    watchContext.shadowOffsetX = 2;
    watchContext.shadowOffsetY = 2;
    
    watchContext.drawImage(
        processedWatchImage,
        -finalWidth / 2,
        -finalHeight / 2,
        finalWidth,
        finalHeight
    );
    
    watchContext.restore();
}

// Detection control functions
function startDetection() {
    if (!selectedHand) {
        showError("Please select which hand to use first.");
        return;
    }
    
    if (!imageLoaded) {
        showError("Please upload a watch image first.");
        return;
    }
    
    if (!cameraInitialized) {
        startCamera();
        return;
    }
    
    isDetecting = true;
    detectLoop();
    updateStatus(`Detecting ${selectedHand} hand...`);
}

function stopDetection() {
    isDetecting = false;
    updateStatus(`Detection stopped. Click "Start Detection" to resume.`);
    
    // Clear canvases
    overlayContext.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    watchContext.clearRect(0, 0, watchCanvas.width, watchCanvas.height);
    
    // Clear hand info
    updateHandInfo('unknown', 'unknown', 0);
}

// Main detection loop
async function detectLoop() {
    if (!isDetecting) return;
    
    const currentTime = Date.now();
    if (currentTime - lastFrameTime < 50) { // Limit to ~20 FPS
        requestAnimationFrame(detectLoop);
        return;
    }
    lastFrameTime = currentTime;
    
    try {
        const wristPosition = await detectWrist();
        if (wristPosition && processedWatchImage) {
            drawWatch();
        }
    } catch (error) {
        console.error("Detection loop error:", error);
    }
    
    requestAnimationFrame(detectLoop);
}

// Export functionality
function exportCurrentView() {
    if (!cameraInitialized) {
        showError("No camera view to export.");
        return;
    }
    
    // Create a temporary canvas for export
    const exportCanvas = document.createElement('canvas');
    const exportContext = exportCanvas.getContext('2d');
    
    exportCanvas.width = videoElement.videoWidth;
    exportCanvas.height = videoElement.videoHeight;
    
    // Draw video frame
    exportContext.drawImage(videoElement, 0, 0);
    
    // Draw watch overlay if available
    if (lastWristPosition && processedWatchImage) {
        exportContext.drawImage(watchCanvas, 0, 0);
    }
    
    // Create download link
    const link = document.createElement('a');
    link.download = `virtual-watch-tryOn-${Date.now()}.png`;
    link.href = exportCanvas.toDataURL('image/png');
    link.click();
    
    feedback.textContent = "Image saved successfully!";
    setTimeout(() => feedback.textContent = "", 3000);
}

// Touch and gesture handling for mobile
let touchStartDistance = 0;
let touchStartScale = 1.0;

// Touch event listeners for pinch-to-zoom
watchCanvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    
    if (e.touches.length === 2) {
        // Calculate initial distance between two fingers
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        touchStartDistance = Math.hypot(
            touch2.clientX - touch1.clientX,
            touch2.clientY - touch1.clientY
        );
        touchStartScale = watchScale;
    }
});

watchCanvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    
    if (e.touches.length === 2) {
        // Calculate current distance
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        const currentDistance = Math.hypot(
            touch2.clientX - touch1.clientX,
            touch2.clientY - touch1.clientY
        );
        
        // Calculate scale change
        const scaleChange = currentDistance / touchStartDistance;
        watchScale = Math.max(0.5, Math.min(3.0, touchStartScale * scaleChange));
    }
});

// Mouse wheel for desktop zoom
watchCanvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    watchScale = Math.max(0.5, Math.min(3.0, watchScale * zoomFactor));
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    switch(e.key) {
        case ' ': // Spacebar to toggle detection
            e.preventDefault();
            if (!toggleDetectionBtn.disabled) {
                toggleDetectionBtn.click();
            }
            break;
        case 'r':
        case 'R':
            if (e.ctrlKey) { // Ctrl+R to reset scale
                e.preventDefault();
                watchScale = 1.0;
            }
            break;
        case 's':
        case 'S':
            if (e.ctrlKey) { // Ctrl+S to save image
                e.preventDefault();
                exportCurrentView();
            }
            break;
        case 'Escape':
            if (isDetecting) {
                stopDetection();
            }
            break;
    }
});

// Performance monitoring
let frameCount = 0;
let fpsStartTime = Date.now();

function updateFPS() {
    frameCount++;
    const currentTime = Date.now();
    
    if (currentTime - fpsStartTime >= 1000) {
        const fps = Math.round((frameCount * 1000) / (currentTime - fpsStartTime));
        
        // Only show FPS in console for debugging
        if (isDetecting) {
            console.log(`FPS: ${fps}`);
        }
        
        frameCount = 0;
        fpsStartTime = currentTime;
    }
}

// Add FPS monitoring to detect loop
const originalDetectLoop = detectLoop;
detectLoop = async function() {
    updateFPS();
    return originalDetectLoop.call(this);
};

// Cleanup function for when page is unloaded
window.addEventListener('beforeunload', () => {
    if (videoElement.srcObject) {
        const tracks = videoElement.srcObject.getTracks();
        tracks.forEach(track => track.stop());
    }
});

// Initialize application
function initializeApp() {
    // Clear any existing state
    selectedHand = null;
    isDetecting = false;
    imageLoaded = false;
    cameraInitialized = false;
    
    // Reset UI
    leftHandBtn.classList.remove('active');
    rightHandBtn.classList.remove('active');
    toggleDetectionBtn.disabled = true;
    
    updateStatus('Please select which hand to use first', 'warning');
    clearError();
    
    // Reset canvas sizes based on container
    const container = document.querySelector('.video-container');
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    
    overlayCanvas.style.width = '100%';
    overlayCanvas.style.height = '100%';
    watchCanvas.style.width = '100%';
    watchCanvas.style.height = '100%';
    
    console.log("Virtual Watch Try-On initialized successfully!");
}

// Error handling for uncaught errors
window.addEventListener('error', (e) => {
    console.error('Uncaught error:', e.error);
    showError('An unexpected error occurred. Please refresh the page.');
});

// Handle camera permission errors more gracefully
function handleCameraError(error) {
    console.error('Camera error:', error);
    
    switch(error.name) {
        case 'NotAllowedError':
            showError('Camera access denied. Please allow camera access and refresh.');
            break;
        case 'NotFoundError':
            showError('No camera found. Please check your camera connection.');
            break;
        case 'NotReadableError':
            showError('Camera is being used by another application.');
            break;
        case 'OverconstrainedError':
            showError('Camera settings not supported. Trying alternative settings...');
            // Try with lower constraints
            startCameraWithLowerConstraints();
            break;
        default:
            showError('Camera error: ' + error.message);
    }
}

// Fallback camera initialization with lower constraints
async function startCameraWithLowerConstraints() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: 'user',
                width: { ideal: 640 },
                height: { ideal: 480 }
            }
        });
        
        videoElement.srcObject = stream;
        videoElement.onloadedmetadata = () => {
            videoElement.play();
            setupCanvasesAfterVideo();
        };
    } catch (err) {
        handleCameraError(err);
    }
}

function setupCanvasesAfterVideo() {
    videoElement.classList.remove('hidden');
    
    [overlayCanvas.width, overlayCanvas.height] = 
        [watchCanvas.width, watchCanvas.height] = 
        [videoElement.videoWidth, videoElement.videoHeight];
    
    cameraInitialized = true;
    updateStatus("Camera initialized. Loading hand detection model...", 'warning');
    loadHandDetectionModel();
}

// Initialize the application when the page loads
document.addEventListener('DOMContentLoaded', initializeApp);

// Add resize handler for responsive design
window.addEventListener('resize', () => {
    if (cameraInitialized) {
        // Adjust canvas sizes if needed
        const container = document.querySelector('.video-container');
        overlayCanvas.style.width = '100%';
        overlayCanvas.style.height = '100%';
        watchCanvas.style.width = '100%';
        watchCanvas.style.height = '100%';
    }
});

// Additional utility functions
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Debounced resize handler
const debouncedResize = debounce(() => {
    if (cameraInitialized) {
        setupCanvasesAfterVideo();
    }
}, 250);

window.addEventListener('resize', debouncedResize);
