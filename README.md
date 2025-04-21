# cpt-cheezbrgr.github.io
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Word Document Format Stripper</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js"></script>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 1000px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f9f9f9;
        }
        
        h1 {
            text-align: center;
            color: #2c3e50;
            margin-bottom: 30px;
        }
        
        .container {
            background-color: white;
            border-radius: 8px;
            padding: 30px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        
        .upload-area {
            border: 2px dashed #3498db;
            border-radius: 5px;
            padding: 40px;
            text-align: center;
            cursor: pointer;
            margin-bottom: 20px;
            transition: all 0.3s;
        }
        
        .upload-area:hover {
            background-color: #f0f9ff;
        }
        
        .upload-area.highlight {
            background-color: #e1f5fe;
            border-color: #2196F3;
        }
        
        #file-input {
            display: none;
        }
        
        .btn {
            background-color: #3498db;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 16px;
            transition: background-color 0.3s;
        }
        
        .btn:hover {
            background-color: #2980b9;
        }
        
        .btn:disabled {
            background-color: #95a5a6;
            cursor: not-allowed;
        }
        
        .result-area {
            margin-top: 30px;
            display: none;
        }
        
        .result-area.visible {
            display: block !important;
        }
        
        #result {
            width: 100%;
            height: 300px;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 5px;
            resize: vertical;
            font-family: monospace;
            margin-bottom: 15px;
        }
        
        .actions {
            display: flex;
            justify-content: space-between;
            margin-top: 15px;
        }
        
        .spinner {
            display: none;
            width: 40px;
            height: 40px;
            margin: 20px auto;
            border: 4px solid rgba(0, 0, 0, 0.1);
            border-radius: 50%;
            border-top-color: #3498db;
            animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
            to {
                transform: rotate(360deg);
            }
        }
        
        .file-info {
            margin-top: 10px;
            font-size: 14px;
            color: #7f8c8d;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Word Document Format Stripper</h1>
        <p>Upload a Word document (.docx) to strip all formatting and convert it to plain text.</p>
        
        <div class="upload-area" id="drop-area">
            <p>Drag and drop a Word document here, or click to select</p>
            <input type="file" id="file-input" accept=".docx" />
            <button class="btn" id="select-file-btn">Select Document</button>
        </div>
        
        <div class="file-info" id="file-info"></div>
        
        <div class="spinner" id="spinner"></div>
        
        <div class="result-area" id="result-area">
            <h2>Plain Text Result:</h2>
            <textarea id="result" readonly></textarea>
            <div class="actions">
                <button class="btn" id="copy-btn">Copy to Clipboard</button>
                <button class="btn" id="download-btn">Download as .txt</button>
                <button class="btn" id="new-file-btn">Process Another File</button>
            </div>
        </div>
    </div>

    <script>
        // Debug function to help troubleshoot issues
        function debug(message) {
            console.log(`[DEBUG] ${message}`);
        }
        
        document.addEventListener('DOMContentLoaded', function() {
            debug('App initialized');
            const dropArea = document.getElementById('drop-area');
            const fileInput = document.getElementById('file-input');
            const selectFileBtn = document.getElementById('select-file-btn');
            const resultArea = document.getElementById('result-area');
            const resultText = document.getElementById('result');
            const copyBtn = document.getElementById('copy-btn');
            const downloadBtn = document.getElementById('download-btn');
            const newFileBtn = document.getElementById('new-file-btn');
            const spinner = document.getElementById('spinner');
            const fileInfo = document.getElementById('file-info');
            
            // Prevent default drag behaviors
            ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
                dropArea.addEventListener(eventName, preventDefaults, false);
                document.body.addEventListener(eventName, preventDefaults, false);
            });
            
            // Highlight drop area when dragging a file over it
            ['dragenter', 'dragover'].forEach(eventName => {
                dropArea.addEventListener(eventName, highlight, false);
            });
            
            ['dragleave', 'drop'].forEach(eventName => {
                dropArea.addEventListener(eventName, unhighlight, false);
            });
            
            // Handle dropped files
            dropArea.addEventListener('drop', handleDrop, false);
            
            // Handle selected files
            fileInput.addEventListener('change', handleFiles, false);
            
            // Button click handlers
            selectFileBtn.addEventListener('click', () => fileInput.click());
            copyBtn.addEventListener('click', copyToClipboard);
            downloadBtn.addEventListener('click', downloadText);
            newFileBtn.addEventListener('click', resetUI);
            
            function preventDefaults(e) {
                e.preventDefault();
                e.stopPropagation();
            }
            
            function highlight() {
                dropArea.classList.add('highlight');
            }
            
            function unhighlight() {
                dropArea.classList.remove('highlight');
            }
            
            function handleDrop(e) {
                const dt = e.dataTransfer;
                const files = dt.files;
                handleFiles({ target: { files } });
            }
            
            function handleFiles(e) {
                const fileList = e.target.files;
                if (fileList.length === 0) return;
                
                const file = fileList[0];
                
                // Check if file is a Word document
                if (!file.name.endsWith('.docx')) {
                    alert('Please upload a .docx file.');
                    return;
                }
                
                // Display file info
                fileInfo.textContent = `File: ${file.name} (${formatFileSize(file.size)})`;
                
                // Show loading spinner
                spinner.style.display = 'block';
                
                // Process the Word document
                processWordDocument(file);
            }
            
            function processWordDocument(file) {
                const reader = new FileReader();
                
                reader.onload = function(e) {
                    const arrayBuffer = e.target.result;
                    
                    // Use mammoth.js to extract text from the Word document
                    mammoth.extractRawText({ arrayBuffer })
                        .then(result => {
                            // Hide spinner
                            spinner.style.display = 'none';
                            
                            // Show result
                            resultText.value = result.value;
                            resultArea.style.display = 'block';
                            
                            // Force visibility
                            resultArea.classList.add('visible');
                            
                            // Log any warnings
                            if (result.messages.length > 0) {
                                console.log('Warnings:', result.messages);
                            }
                            
                            // Debug info
                            console.log('Text extracted successfully, length:', result.value.length);
                            console.log('Result area should now be visible');
                        })
                        .catch(error => {
                            spinner.style.display = 'none';
                            alert('Error processing document: ' + error.message);
                            console.error(error);
                        });
                };
                
                reader.onerror = function() {
                    spinner.style.display = 'none';
                    alert('Error reading file');
                };
                
                reader.readAsArrayBuffer(file);
            }
            
            function copyToClipboard() {
                resultText.select();
                document.execCommand('copy');
                
                // Visual feedback
                const originalText = copyBtn.textContent;
                copyBtn.textContent = 'Copied!';
                setTimeout(() => {
                    copyBtn.textContent = originalText;
                }, 2000);
            }
            
            function downloadText() {
                const text = resultText.value;
                const blob = new Blob([text], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                
                const a = document.createElement('a');
                a.href = url;
                a.download = 'extracted_text.txt';
                document.body.appendChild(a);
                a.click();
                
                // Clean up
                setTimeout(() => {
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                }, 0);
            }
            
            function resetUI() {
                fileInput.value = '';
                fileInfo.textContent = '';
                resultText.value = '';
                resultArea.style.display = 'none';
            }
            
            function formatFileSize(bytes) {
                if (bytes === 0) return '0 Bytes';
                
                const k = 1024;
                const sizes = ['Bytes', 'KB', 'MB', 'GB'];
                const i = Math.floor(Math.log(bytes) / Math.log(k));
                
                return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
            }
        });
    </script>
</body>
</html>
