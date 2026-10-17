# frozen_string_literal: true

require "fileutils"
require_relative "lib/thuelang/version"

# `gem build ruby/thuelang.gemspec` runs from the repository root. Rubygems
# checks the file list from that process cwd, and the executable path is exe/thue.
origin = Dir.pwd
unless File.file?("exe/thue")
  Dir.chdir(__dir__)
  at_exit do
    gem_name = "thuelang-#{Thuelang::VERSION}.gem"
    destination = File.join(origin, gem_name)
    next unless File.file?(gem_name)
    next if File.expand_path(gem_name) == File.expand_path(destination)

    FileUtils.cp(gem_name, destination)
    File.delete(gem_name)
  end
end

Gem::Specification.new do |spec|
  spec.name = "thuelang"
  spec.version = Thuelang::VERSION
  spec.authors = ["Thue++"]
  spec.summary = "Thue++ interpreter"
  spec.description = "Ruby host for Thue++. The gem is thuelang and the command is thue."
  spec.homepage = "https://thuelang.org"
  spec.license = "MIT"
  spec.required_ruby_version = ">= 3.1"
  spec.files = Dir["lib/**/*.rb", "exe/**/*", "README.md"]
  spec.bindir = "exe"
  spec.executables = ["thue"]
  spec.require_paths = ["lib"]
  spec.add_dependency "re2", "~> 2.15"
  spec.metadata = {
    "homepage_uri" => "https://thuelang.org",
    "source_code_uri" => "https://github.com/thuelang/thueplusplus",
    "changelog_uri" => "https://github.com/thuelang/thueplusplus/blob/main/CHANGELOG.md",
    "rubygems_mfa_required" => "true"
  }
end
