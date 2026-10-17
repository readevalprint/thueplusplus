plugins {
    application
}

group = "org.thuelang"
version = "0.1.0"

java {
    toolchain {
        languageVersion.set(JavaLanguageVersion.of(21))
    }
}

repositories {
    mavenCentral()
}

dependencies {
    implementation("com.google.re2j:re2j:1.8")
    implementation("com.fasterxml.jackson.core:jackson-databind:2.18.3")
}

application {
    mainClass.set("org.thuelang.thuelang.Cli")
    applicationName = "thue"
    applicationDefaultJvmArgs = listOf(
        "-Xms16m",
        "-Xmx128m",
        "-XX:+UseSerialGC",
        "-XX:MaxMetaspaceSize=64m",
        "-Dfile.encoding=UTF-8",
    )
}

tasks.withType<JavaCompile>().configureEach {
    options.encoding = "UTF-8"
    options.release.set(21)
}
