<?xml version='1.0' encoding='UTF-8'?>
<StyledLayerDescriptor xmlns="http://www.opengis.net/sld" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" version="1.0.0" xsi:schemaLocation="http://www.opengis.net/sld http://schemas.opengis.net/sld/1.0.0/StyledLayerDescriptor.xsd">
  <NamedLayer>
    <Name>AwasVikas:gda_drainage_system</Name>
    <UserStyle>
      <Title>A green line style</Title>
      <FeatureTypeStyle>
        <Rule>
          <Title>green line</Title>
          <MinScaleDenominator>34000</MinScaleDenominator>
          <LineSymbolizer>
            <Stroke>
              <CssParameter name="stroke">#09cc00</CssParameter>
              <CssParameter name="stroke-width">0.7</CssParameter>
            </Stroke>
          </LineSymbolizer>
        </Rule>
        <Rule>
          <Title>green line</Title>
          <MinScaleDenominator>8500</MinScaleDenominator>
          <MaxScaleDenominator>34000</MaxScaleDenominator>
          <LineSymbolizer>
            <Stroke>
              <CssParameter name="stroke">#09cc00</CssParameter>
              <CssParameter name="stroke-width">1.1</CssParameter>
            </Stroke>
          </LineSymbolizer>
        </Rule>
        <Rule>
          <Title>green line</Title>
          <MaxScaleDenominator>8500</MaxScaleDenominator>
          <LineSymbolizer>
            <Stroke>
              <CssParameter name="stroke">#09cc00</CssParameter>
              <CssParameter name="stroke-width">1.8</CssParameter>
            </Stroke>
          </LineSymbolizer>
        </Rule>
      </FeatureTypeStyle>
    </UserStyle>
  </NamedLayer>
</StyledLayerDescriptor>