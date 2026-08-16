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
  # CocoaPods requires a git/http/svn/hg source key on the podspec even for
  # local :path pods. The Podfile's :path => '...' entry overrides this at
  # install time; the value here is only used by `pod spec lint`.
  s.source       = { :git => 'https://github.com/example/watch-connectivity.git', :tag => s.version.to_s }
  # No source_files: WatchConnectivityModule is already in the main app target.
  # ExpoModulesCore is declared as a dependency so the pod is non-empty
  # (CocoaPods rejects specs with no files, resources, or dependencies).
  s.dependency 'ExpoModulesCore'
end
