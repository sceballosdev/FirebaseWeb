/**
 * Copyright 2017 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Note: You will edit this file in the follow up codelab about the Cloud Functions for Firebase.

// TODO(DEVELOPER): Import the Cloud Functions for Firebase and the Firebase Admin modules here.

// Import the Firebase SDK for Google Cloud Functions.
const functions = require('firebase-functions');

// Import and initialize the Firebase Admin SDK
const admin = require('firebase-admin');
admin.initializeApp();

// TODO(DEVELOPER): Write the addWelcomeMessages Function here.
exports.addWelcomeMessages = functions.auth.user().onCreate(async (user) => {
    console.log('A new user signed in for the first time.');

    const fullName = user.displayName || 'Anonymous';

    // Saves the new welcome message into the database
    // Which then displays it in the FriendlyChat clients.
    await admin.firestore().collection('messages').add({
        name: 'Firebase Bot',
        profilePicUrl: '/images/firebase-logo.png', // Firebase logo
        text: `${fullName} signed in for the first time! Welcome!`,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log('Welcome message written to database');
});

// TODO(DEVELOPER): Write the blurOffensiveImages Function here.
const Vision = require('@google-cloud/vision');
const vision = new Vision();
const spawn = require('child-process-promise').spawn;

const path = require("path");
const os = require("os");
const fs = require("fs");

// Checks if uploaded images are flagged as Adult or Violence and if so blurs them.
exports.blurOffensiveImages = functions.runWith({memory: '2GB'}).storage.object().onFinalize(
    async (object) => {
        const image = {
            source: {imageUri: `gs://${object.bucket}/${object.name}`}
        };

        // Check the image content using the Cloud Vision Api
        const batchAnnotateImagesResponse = await vision.safeSearchDetection(image);
        const safeSearchResult = batchAnnotateImagesResponse[0].safeSearchAnnotation;
        const Likelihood = Vision.types.Likelihood;
        if (Likelihood[safeSearchResult.adult] >= Likelihood.LIKELY || Likelihood[safeSearchResult.violence] >= Likelihood.LIKELY) {
            console.log('The image', object.name, 'has been detected as inappropiate.');
            return blurImage(object.name);
        }

        console.log('The image', object.name, 'has been detected as OK.');
    }
);

async function blurImage(filePath) {
    const tempLocalFile = path.join(os.tmpdir(), path.basename(filePath));
    const messageId = filePath.split(path.sep)[1];
    const bucket = admin.storage().bucket();

    // Download file from bucket.
    await bucket.file(filePath).download({destination: tempLocalFile});
    console.log('Image has been downloaded to', tempLocalFile);

    // Blur the image using ImageMagic.
    await spawn('convert', [tempLocalFile, '-channel', 'RGBA', '-blur', '0x24', tempLocalFile]);
    console.log('Image has been blurred');

    // Uploading the blurred image back into the bucket.
    await bucket.upload(tempLocalFile, {destination: filePath});
    console.log('Blurred image has been uploaded to', filePath);

    // Deleting the local file to free up disk space.
    fs.unlinkSync(tempLocalFile);
    console.log('delete local file');

    // Indicate that the message has been moderated.
    await admin.firestore().collection('messages').doc(messageId).update({moderated: true});
    console.log('Marked the image as moderated in the database.');
}

// TODO(DEVELOPER): Write the sendNotifications Function here.
