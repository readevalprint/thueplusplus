cmake_minimum_required(VERSION 3.16)
project(thue VERSION 0.5.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

find_package(PkgConfig REQUIRED)
pkg_check_modules(RE2 REQUIRED IMPORTED_TARGET re2)
find_package(Threads REQUIRED)

add_library(thue src/engine.cpp)
add_library(thue::thue ALIAS thue)
target_include_directories(thue
  PUBLIC
    $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
    $<INSTALL_INTERFACE:include>
  PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/src
)
target_link_libraries(thue PUBLIC PkgConfig::RE2 Threads::Threads)
target_compile_options(thue PRIVATE -Wall -Wextra -Wpedantic)

add_executable(thue-cli src/cli.cpp)
target_link_libraries(thue-cli PRIVATE thue)
set_target_properties(thue-cli PROPERTIES OUTPUT_NAME thue)
target_compile_options(thue-cli PRIVATE -Wall -Wextra -Wpedantic)

include(GNUInstallDirs)
install(TARGETS thue thue-cli
  ARCHIVE DESTINATION ${CMAKE_INSTALL_LIBDIR}
  LIBRARY DESTINATION ${CMAKE_INSTALL_LIBDIR}
  RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR}
)
install(DIRECTORY include/ DESTINATION ${CMAKE_INSTALL_INCLUDEDIR})
