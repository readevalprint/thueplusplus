"""Conan 2 recipe for the Thue++ C++ host.

This file is a packaging sketch. This repository does not publish it.
"""

from conan import ConanFile
from conan.tools.cmake import CMake, CMakeToolchain, cmake_layout
from conan.tools.gnu import PkgConfigDeps


class ThueConan(ConanFile):
    name = "thue"
    version = "0.5.0"
    package_type = "library"
    settings = "os", "compiler", "build_type", "arch"
    options = {"shared": [True, False], "fPIC": [True, False]}
    default_options = {"shared": False, "fPIC": True}
    exports_sources = "CMakeLists.txt", "include/*", "src/*"

    def requirements(self):
        self.requires("re2/20240702")

    def layout(self):
        cmake_layout(self)

    def generate(self):
        deps = PkgConfigDeps(self)
        deps.generate()
        toolchain = CMakeToolchain(self)
        toolchain.generate()

    def build(self):
        cmake = CMake(self)
        cmake.configure()
        cmake.build()

    def package(self):
        cmake = CMake(self)
        cmake.install()

    def package_info(self):
        self.cpp_info.libs = ["thue"]
