plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// AndroidX annotation-experimental is only needed as a compile-time annotation library.
// Some Android/Gradle combinations can pull its generated R class into the dex archive
// twice through transitive dependencies/caches. Excluding it from packaged classpaths
// prevents: "Type androidx.annotation.experimental.R is defined multiple times".
configurations.configureEach {
    exclude(group = "androidx.annotation", module = "annotation-experimental")
}

android {
    namespace = "de.tickerdisplay"
    compileSdk = 35

    defaultConfig {
        applicationId = "de.tickerdisplay"
        minSdk = 23
        targetSdk = 35
        versionCode = 313
        versionName = "3.0.13"
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt")
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        viewBinding = true
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.constraintlayout:constraintlayout:2.2.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.google.code.gson:gson:2.11.0")

    // QR-Code Scanner
    implementation("com.journeyapps:zxing-android-embedded:4.3.0")
    implementation("com.google.zxing:core:3.5.3")
}