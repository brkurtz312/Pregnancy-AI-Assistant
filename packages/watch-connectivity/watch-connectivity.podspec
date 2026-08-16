Pod::Spec.new do |s|
  s.name         = 'watch-connectivity'
  s.version      = '1.0.0'
  s.summary      = 'WatchConnectivity Expo module registration shim.'
  s.description  = <<-DESC
    Placeholder pod that satisfies expo-modules-autolinking's podspec requirement.
    WatchConnectivityModule.swift is compiled directly into the main iOS app
    target by the withWatchExtension config plugin. This pod has no source
    files — it exists only so autolinking adds WatchConnectivityModule.self
    to ExpoModulesProvider.getModuleClasses() without runtime patching.
  DESC
  s.homepage     = 'https://github.com/example/watch-connectivity'
  s.license      = { :type => 'MIT' }
  s.author       = { 'Replit' => 'support@replit.com' }
  s.platform     = :ios, '13.0'
  s.source       = { :path => '.' }
  # No source_files: WatchConnectivityModule is already in the main app target.
  # No imports will be generated (swiftModuleName: "" in expo-module.config.json).
end
